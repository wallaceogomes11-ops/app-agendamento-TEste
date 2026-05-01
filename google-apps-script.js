/**
 * BarberSchedule — Google Apps Script (backend)
 * 
 * Cole este código no Google Apps Script da sua planilha:
 * Planilha → Extensões → Apps Script → substitua o código → Implantar
 *
 * NOVIDADES vs. versão anterior:
 *  - doGet()  → lista horários ocupados do dia (para o frontend sincronizar)
 *  - doPost() → valida concorrência ANTES de gravar (evita duplo agendamento)
 *
 * Colunas esperadas na planilha (linha 1 = cabeçalhos):
 *   A: Nome | B: Horário | C: Data | D: Valor | E: Telefone | F: Tipo de serviço
 */


/* ══════════════════════════════════════════════════
   GET — Lista horários ocupados do dia
   Chamado pelo frontend ao carregar a página e no polling (a cada 30s)
══════════════════════════════════════════════════ */

function doGet(e) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const acao     = e.parameter.acao;
    const data     = e.parameter.data;     // Formato: DD/MM/AAAA
    const callback = e.parameter.callback; // JSONP: nome da função de callback

    if (acao === 'listar' && data) {
      const horariosOcupados = listarHorariosOcupados(data);
      const corpo = { status: 'ok', horariosOcupados };

      // Se vier parâmetro callback, retorna JSONP em vez de JSON puro
      // JSONP contorna o bloqueio CORS do navegador ao usar <script> dinâmico
      if (callback) {
        return ContentService
          .createTextOutput(`${callback}(${JSON.stringify(corpo)})`)
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }

      return criarResposta(corpo, headers);
    }

    return criarResposta({ status: 'erro', mensagem: 'Ação inválida' }, headers);

  } catch (err) {
    return criarResposta({ status: 'erro', mensagem: err.message }, headers);
  }
}


/* ══════════════════════════════════════════════════
   POST — Registra novo agendamento com controle de concorrência
   Verifica se o horário ainda está livre ANTES de gravar
══════════════════════════════════════════════════ */

function doPost(e) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    // Suporta dois formatos de envio:
    // 1. fetch() com body JSON    → dados chegam em e.postData.contents
    // 2. <form> HTML invisível    → dados chegam em e.parameter.payload (campo oculto)
    let dados;
    if (e.parameter && e.parameter.payload) {
      dados = JSON.parse(e.parameter.payload);
    } else {
      dados = JSON.parse(e.postData.contents);
    }

    if (dados.acao === 'agendar') {
      return processarAgendamento(dados, headers);
    }

    return criarResposta({ status: 'erro', mensagem: 'Ação inválida' }, headers);

  } catch (err) {
    return criarResposta({ status: 'erro', mensagem: err.message }, headers);
  }
}


/* ══════════════════════════════════════════════════
   LÓGICA DE NEGÓCIO
══════════════════════════════════════════════════ */

/**
 * Retorna array com os horários já ocupados para uma data específica.
 * Lê diretamente da planilha para garantir dados em tempo real.
 *
 * @param {string} data - Data no formato DD/MM/AAAA
 * @returns {string[]} Array de horários ocupados, ex: ['09:00', '14:00']
 */
function listarHorariosOcupados(data) {
  const planilha = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const ultimaLinha = planilha.getLastRow();

  if (ultimaLinha < 2) return []; // Planilha vazia (só cabeçalho)

  // Lê apenas as colunas de horário (B) e data (C) para eficiência
  const dados = planilha.getRange(2, 1, ultimaLinha - 1, 3).getValues();
  // dados[i][0] = Nome, dados[i][1] = Horário, dados[i][2] = Data

  const horariosOcupados = dados
    .filter(row => String(row[2]).trim() === data.trim() && row[1])
    .map(row => String(row[1]).trim());

  return horariosOcupados;
}

/**
 * Processa um novo agendamento com controle de concorrência.
 * Usa LockService para garantir que apenas um agendamento por horário
 * seja processado por vez, mesmo com requisições simultâneas.
 *
 * @param {Object} dados - Dados do agendamento recebidos do frontend
 * @param {Object} headers - Headers CORS para a resposta
 * @returns {TextOutput} Resposta JSON
 */
function processarAgendamento(dados, headers) {
  // LockService garante exclusão mútua — apenas uma execução por vez
  // Isso é o controle de concorrência real no servidor
  const lock = LockService.getScriptLock();

  try {
    // Tenta adquirir o lock por até 10 segundos
    lock.waitLock(10000);

    // ── Com o lock adquirido, verifica novamente se o horário está livre ──
    const ocupados = listarHorariosOcupados(dados.data);

    if (ocupados.includes(dados.horario)) {
      // Conflito detectado: outro usuário agendou enquanto este estava processando
      return criarResposta({ status: 'conflito', mensagem: 'Horário já ocupado' }, headers);
    }

    // Horário ainda disponível — grava na planilha
    const planilha = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    planilha.appendRow([
      dados.nome        || '',
      dados.horario     || '',
      dados.data        || '',
      dados.valor       || '',
      dados.telefone    || '',
      dados.tipoServico || '',
    ]);

    return criarResposta({ status: 'ok', mensagem: 'Agendamento confirmado' }, headers);

  } catch (err) {
    // Pode ocorrer se o lock não for obtido em 10s (muita concorrência)
    return criarResposta({ status: 'erro', mensagem: 'Servidor ocupado. Tente novamente.' }, headers);

  } finally {
    // Sempre libera o lock, mesmo em caso de erro
    try { lock.releaseLock(); } catch (_) {}
  }
}


/* ══════════════════════════════════════════════════
   UTILITÁRIOS
══════════════════════════════════════════════════ */

/**
 * Cria uma resposta JSON com headers CORS corretos.
 * O Apps Script precisa retornar ContentService com os headers adequados
 * para que o frontend possa ler a resposta (sem 'no-cors').
 *
 * @param {Object} corpo - Objeto a serializar como JSON
 * @param {Object} _headers - (não usado diretamente, CORS é via ContentService)
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function criarResposta(corpo, _headers) {
  return ContentService
    .createTextOutput(JSON.stringify(corpo))
    .setMimeType(ContentService.MimeType.JSON);
}
