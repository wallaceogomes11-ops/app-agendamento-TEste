/* ════════════════════════════════════════════════════
   BarberSchedule — script.js
   Lógica completa do sistema de agendamento
════════════════════════════════════════════════════ */

'use strict';

/* ── CONFIGURAÇÕES ─────────────────────────────────
   Altere aqui para personalizar facilmente o sistema
─────────────────────────────────────────────────── */
const CONFIG = {
  // Endpoint do Google Apps Script (POST — salvar agendamentos)
  SHEETS_ENDPOINT: 'https://script.google.com/macros/s/AKfycbzkrjbB7F3CX4vFjya5IG0miXV35puuM2VzcJMq8MEup7UNbck3yt7RE6hy6FR0huUv/exec',

  // URL CSV pública da planilha (GET — ler horários ocupados, sem CORS)
  // Derivada de: https://docs.google.com/spreadsheets/d/e/2PACX-.../pubhtml?gid=0
  SHEETS_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSm-ig3Jh4mj5P6iM3HNgnkzzUKJwaQT3bYpW-RpQ6rL0IQTg9TGivPQC2YHlxQPE8mglyE5T9aNR43/pub?gid=0&single=true&output=csv',

  // Horários disponíveis (formato HH:MM)
  HORARIOS: [
    '09:00', '10:00', '11:00',
    '12:00', '13:00', '14:00',
    '15:00', '16:00', '17:00',
    '18:00'
  ],

  // Mapa de preços por serviço
  PRECOS: {
    'Corte Simples': '35,00',
    'Barba':         '25,00',
    'Corte + Barba': '55,00',
    'Hidratação':    '40,00',
    'Pigmentação':   '80,00',
  },

  // Duração do toast (ms)
  TOAST_DURATION: 3500,
};

/* ── ESTADO DA APLICAÇÃO ────────────────────────── */
const state = {
  horarioSelecionado: null,      // Horário clicado pelo usuário
  horariosOcupados: new Set(),   // Horários já agendados nessa sessão
  servicoAtivo: 'Corte Simples', // Serviço selecionado nos chips
};

/* ── REFERÊNCIAS DOM ────────────────────────────── */
const dom = {
  // Header
  statusTime:  document.getElementById('statusTime'),
  headerDay:   document.getElementById('headerDay'),
  headerDate:  document.getElementById('headerDate'),
  slotsCount:  document.getElementById('slotsCount'),

  // Grade de horários
  slotsGrid:   document.getElementById('slotsGrid'),

  // Modal
  overlay:         document.getElementById('modalOverlay'),
  sheet:           document.getElementById('modalSheet'),
  modalClose:      document.getElementById('modalClose'),
  modalTimeDisplay:document.getElementById('modalTimeDisplay'),

  // Campos do formulário
  inputNome:      document.getElementById('inputNome'),
  inputTelefone:  document.getElementById('inputTelefone'),
  inputServico:   document.getElementById('inputServico'),
  inputValor:     document.getElementById('inputValor'),

  // Resumo
  summaryData:    document.getElementById('summaryData'),
  summaryHorario: document.getElementById('summaryHorario'),

  // Botão confirmar
  btnConfirm: document.getElementById('btnConfirm'),
  btnLoader:  document.getElementById('btnLoader'),

  // Toast
  toast:    document.getElementById('toast'),
  toastMsg: document.getElementById('toastMsg'),
  toastIcon:document.getElementById('toastIcon'),
};


/* ══════════════════════════════════════════════════
   INICIALIZAÇÃO
══════════════════════════════════════════════════ */
async function init() {
  atualizarRelogio();
  atualizarDataHeader();
  bindEventos();
  setInterval(atualizarRelogio, 30_000); // atualiza a cada 30s

  // Renderiza os horários IMEDIATAMENTE (todos disponíveis)
  renderizarSlots();

  // Depois busca os ocupados em background e atualiza
  sincronizarHorarios();
}


/* ══════════════════════════════════════════════════
   SINCRONIZAÇÃO COM GOOGLE SHEETS (GET)
══════════════════════════════════════════════════ */

/**
 * Busca horários ocupados na planilha e re-renderiza os slots.
 * Chamado na inicialização e opcionalmente após cada agendamento.
 */
async function sincronizarHorarios() {
  // Se estiver abrindo como arquivo local (file://), não tenta fetch
  if (location.protocol === 'file:') {
    console.info('[BarberSchedule] Modo local — sincronização desativada.');
    return;
  }

  try {
    const ocupados = await Promise.race([
      buscarHorariosOcupados(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ]);

    // Só re-renderiza se houver diferença
    const antes = state.horariosOcupados.size;
    state.horariosOcupados = new Set(ocupados);
    if (state.horariosOcupados.size !== antes) {
      renderizarSlots();
    }
  } catch (err) {
    console.warn('[BarberSchedule] Sincronização falhou:', err.message);
    // Horários já estão visíveis — não faz nada
  }
}

/**
 * Faz um GET no endpoint do Apps Script e retorna array de horários ocupados.
 * O Apps Script deve estar publicado com acesso "Qualquer pessoa".
 * @returns {Promise<string[]>}
 */
async function buscarHorariosOcupados() {
  // Lê a planilha como CSV público — sem problema de CORS
  const url = CONFIG.SHEETS_CSV_URL + '&t=' + Date.now();
  const resposta = await fetch(url, { redirect: 'follow' });

  if (!resposta.ok) {
    throw new Error(`HTTP ${resposta.status}`);
  }

  const texto = await resposta.text();

  // Parseia CSV: pula linha 0 (cabeçalho), lê coluna B (índice 1) = Horário
  const linhas = texto.trim().split('
');
  const ocupados = linhas
    .slice(1)
    .map(linha => {
      const cols = linha.split(',');
      return (cols[1] || '').replace(/"/g, '').trim();
    })
    .filter(h => h !== '');

  return ocupados;
}

/**
 * Exibe células skeleton enquanto aguarda a resposta do Sheets.
 * Reutiliza a grade existente sem criar novos elementos desnecessários.
 */
function exibirSkeletonSlots() {
  dom.slotsGrid.innerHTML = '';
  dom.slotsCount.textContent = 'Sincronizando…';

  // Cria 9 esqueletos (quantidade aproximada dos horários)
  for (let i = 0; i < CONFIG.HORARIOS.length; i++) {
    const sk = document.createElement('div');
    sk.classList.add('slot-skeleton');
    sk.style.animationDelay = `${i * 40}ms`;
    dom.slotsGrid.appendChild(sk);
  }
}


/* ══════════════════════════════════════════════════
   RELÓGIO E DATA
══════════════════════════════════════════════════ */

/**
 * Atualiza o relógio na status bar simulada
 */
function atualizarRelogio() {
  const agora = new Date();
  const hh = String(agora.getHours()).padStart(2, '0');
  const mm = String(agora.getMinutes()).padStart(2, '0');
  dom.statusTime.textContent = `${hh}:${mm}`;
}

/**
 * Preenche a data e dia da semana no header
 */
function atualizarDataHeader() {
  const agora = new Date();

  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  dom.headerDay.textContent = dias[agora.getDay()].toUpperCase();
  dom.headerDate.textContent = `${agora.getDate()} ${meses[agora.getMonth()]}`;
  dom.summaryData.textContent = agora.toLocaleDateString('pt-BR');
}


/* ══════════════════════════════════════════════════
   RENDERIZAÇÃO DOS SLOTS DE HORÁRIO
══════════════════════════════════════════════════ */

/**
 * Cria e insere na grade APENAS os horários disponíveis.
 * Horários presentes em state.horariosOcupados são omitidos.
 */
function renderizarSlots() {
  dom.slotsGrid.innerHTML = '';

  // Filtra para exibir só os horários livres
  const horariosLivres = CONFIG.HORARIOS.filter(h => !state.horariosOcupados.has(h));

  if (horariosLivres.length === 0) {
    // Nenhum horário disponível — exibe mensagem amigável
    const aviso = document.createElement('p');
    aviso.classList.add('slots-empty');
    aviso.textContent = 'Todos os horários de hoje estão ocupados. Volte amanhã! 🗓️';
    dom.slotsGrid.appendChild(aviso);
  } else {
    horariosLivres.forEach((horario, index) => {
      const btn = criarBotaoSlot(horario, index);
      dom.slotsGrid.appendChild(btn);
    });
  }

  atualizarContadorSlots();
}

/**
 * Cria um botão de slot individual
 * @param {string} horario - Horário no formato HH:MM
 * @param {number} index   - Índice para delay de animação
 * @returns {HTMLButtonElement}
 */
function criarBotaoSlot(horario, index) {
  const ocupado = state.horariosOcupados.has(horario);
  const periodo = getPeriodo(horario);

  const btn = document.createElement('button');
  btn.classList.add('slot-btn');
  if (ocupado) btn.classList.add('booked');

  // Delay escalonado na animação de entrada
  btn.style.animationDelay = `${index * 60}ms`;

  btn.dataset.horario = horario;
  btn.setAttribute('aria-label', `Agendar às ${horario}${ocupado ? ' — já agendado' : ''}`);
  btn.disabled = ocupado;

  btn.innerHTML = `
    <div class="slot-badge"></div>
    <span class="slot-time">${horario}</span>
    <span class="slot-period">${periodo}</span>
    ${ocupado ? '<span class="slot-booked-label">Agendado</span>' : ''}
  `;

  if (!ocupado) {
    btn.addEventListener('click', () => abrirModal(horario, btn));
  }

  return btn;
}

/**
 * Retorna a legenda de período para um horário
 * @param {string} horario
 * @returns {string}
 */
function getPeriodo(horario) {
  const hora = parseInt(horario.split(':')[0], 10);
  if (hora < 12) return 'Manhã';
  if (hora < 18) return 'Tarde';
  return 'Noite';
}

/**
 * Atualiza o contador de slots disponíveis na barra de info
 */
function atualizarContadorSlots() {
  const disponíveis = CONFIG.HORARIOS.length - state.horariosOcupados.size;
  const label = disponíveis <= 0 ? 'Esgotado' : `${disponíveis} horário${disponíveis !== 1 ? 's' : ''}`;
  dom.slotsCount.textContent = label;
}


/* ══════════════════════════════════════════════════
   MODAL — ABRIR / FECHAR
══════════════════════════════════════════════════ */

/**
 * Abre o modal de agendamento para o horário escolhido
 * @param {string} horario - Horário selecionado
 * @param {HTMLButtonElement} btn - Botão clicado (para animar)
 */
function abrirModal(horario, btn) {
  state.horarioSelecionado = horario;

  // Preenche os dados do modal
  dom.modalTimeDisplay.textContent = horario;
  dom.summaryHorario.textContent = horario;

  // Pré-preenche serviço e valor baseados no chip ativo
  dom.inputServico.value = state.servicoAtivo;
  dom.inputValor.value = CONFIG.PRECOS[state.servicoAtivo] || '';

  // Limpa nome e telefone
  dom.inputNome.value = '';
  dom.inputTelefone.value = '';

  // Remove erros anteriores
  limparErros();

  // Exibe overlay + sheet
  dom.overlay.classList.add('active');
  dom.overlay.setAttribute('aria-hidden', 'false');

  // Foco acessível no primeiro campo
  setTimeout(() => dom.inputNome.focus(), 350);
}

/**
 * Fecha o modal com animação
 */
function fecharModal() {
  dom.overlay.classList.remove('active');
  dom.overlay.setAttribute('aria-hidden', 'true');
  state.horarioSelecionado = null;

  // Restaura botão se estava carregando
  restaurarBotaoConfirmar();
}


/* ══════════════════════════════════════════════════
   VALIDAÇÃO DO FORMULÁRIO
══════════════════════════════════════════════════ */

/**
 * Valida todos os campos do formulário
 * @returns {{ valido: boolean, dados: Object|null }}
 */
function validarFormulario() {
  limparErros();

  const nome     = dom.inputNome.value.trim();
  const telefone = dom.inputTelefone.value.trim();
  const servico  = dom.inputServico.value;
  const valor    = dom.inputValor.value.trim();
  let valido = true;

  if (nome.length < 2) {
    marcarErro(dom.inputNome, 'Informe seu nome completo');
    valido = false;
  }

  if (!validarTelefone(telefone)) {
    marcarErro(dom.inputTelefone, 'Informe um telefone válido');
    valido = false;
  }

  if (!servico) {
    marcarErro(dom.inputServico, 'Selecione o tipo de serviço');
    valido = false;
  }

  if (!valor) {
    marcarErro(dom.inputValor, 'Informe o valor do serviço');
    valido = false;
  }

  if (!valido) return { valido: false, dados: null };

  return {
    valido: true,
    dados: {
      nome,
      horario:     state.horarioSelecionado,
      data:        new Date().toLocaleDateString('pt-BR'),
      valor,
      telefone,
      tipoServico: servico,
    },
  };
}

/**
 * Valida número de telefone (aceita formatos brasileiros comuns)
 * @param {string} tel
 * @returns {boolean}
 */
function validarTelefone(tel) {
  const limpo = tel.replace(/\D/g, '');
  return limpo.length >= 10 && limpo.length <= 11;
}

/**
 * Marca um campo com estado de erro e exibe mensagem
 * @param {HTMLElement} input
 * @param {string} mensagem
 */
function marcarErro(input, mensagem) {
  input.classList.add('error');

  // Cria mensagem de erro se ainda não existir
  if (!input.nextElementSibling?.classList?.contains('error-msg')) {
    const msg = document.createElement('span');
    msg.classList.add('field-hint', 'error-msg');
    msg.style.color = 'var(--clr-error)';
    msg.textContent = mensagem;
    input.insertAdjacentElement('afterend', msg);
  }
}

/**
 * Remove todos os estados de erro do formulário
 */
function limparErros() {
  document.querySelectorAll('.field-input.error').forEach(el => {
    el.classList.remove('error');
  });
  document.querySelectorAll('.error-msg').forEach(el => el.remove());
}


/* ══════════════════════════════════════════════════
   ENVIO PARA O GOOGLE SHEETS
══════════════════════════════════════════════════ */

/**
 * Confirma o agendamento: valida, envia para Sheets e atualiza UI
 */
async function confirmarAgendamento() {
  const { valido, dados } = validarFormulario();
  if (!valido) return;

  // Inicia estado de carregamento
  iniciarCarregamento();

  try {
    await enviarParaSheets(dados);

    // Sucesso: adiciona ao estado local imediatamente (resposta rápida)
    state.horariosOcupados.add(dados.horario);

    // Fecha o modal
    fecharModal();

    // Remove o slot da tela imediatamente (feedback instantâneo)
    removerSlotDaTela(dados.horario);

    // Exibe toast de sucesso
    exibirToast(`✅ ${dados.nome}, horário ${dados.horario} confirmado!`, 'success');

    // Atualiza o contador
    atualizarContadorSlots();

    // Re-sincroniza com a planilha em background para capturar agendamentos
    // feitos por outros usuários enquanto este estava preenchendo o formulário
    sincronizarHorarios();

  } catch (err) {
    console.error('[BarberSchedule] Erro ao enviar para Sheets:', err);
    restaurarBotaoConfirmar();
    exibirToast('❌ Erro ao confirmar. Tente novamente.', 'error');
  }
}

/**
 * Envia os dados do agendamento para o Google Apps Script
 * @param {Object} dados
 * @returns {Promise<void>}
 */
async function enviarParaSheets(dados) {
  const resposta = await fetch(CONFIG.SHEETS_ENDPOINT, {
    method: 'POST',
    // Google Apps Script requer mode: 'no-cors' para evitar bloqueio CORS.
    // Isso significa que não conseguimos ler o status da resposta,
    // mas o dado é enviado e registrado normalmente na planilha.
    mode: 'no-cors',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      nome:        dados.nome,
      horario:     dados.horario,
      data:        dados.data,
      valor:       dados.valor,
      telefone:    dados.telefone,
      tipoServico: dados.tipoServico,
    }),
  });

  // Com mode: 'no-cors', o tipo da resposta é 'opaque' — consideramos sucesso
  // se não houve exceção de rede
  return resposta;
}


/* ══════════════════════════════════════════════════
   ATUALIZAÇÃO DE UI
══════════════════════════════════════════════════ */

/**
 * Inicia estado de carregamento no botão confirmar
 */
function iniciarCarregamento() {
  dom.btnConfirm.disabled = true;
  dom.btnConfirm.querySelector('.btn-text').hidden = true;
  dom.btnLoader.hidden = false;
}

/**
 * Restaura o botão confirmar ao estado original
 */
function restaurarBotaoConfirmar() {
  dom.btnConfirm.disabled = false;
  dom.btnConfirm.querySelector('.btn-text').hidden = false;
  dom.btnLoader.hidden = true;
}

/**
 * Remove imediatamente um slot da tela após agendamento confirmado.
 * A re-sincronização via GET cuidará do estado definitivo em seguida.
 * @param {string} horario
 */
function removerSlotDaTela(horario) {
  const btn = dom.slotsGrid.querySelector(`[data-horario="${horario}"]`);
  if (!btn) return;

  btn.classList.add('just-booked');

  // Remove o elemento após a animação de saída
  setTimeout(() => {
    btn.remove();
  }, 500);
}

/**
 * Exibe o toast de notificação
 * @param {string} mensagem
 * @param {'success'|'error'} tipo
 */
function exibirToast(mensagem, tipo = 'success') {
  dom.toastMsg.textContent = mensagem;
  dom.toast.className = `toast ${tipo} show`;

  // Remove automaticamente após a duração configurada
  clearTimeout(dom.toast._timeout);
  dom.toast._timeout = setTimeout(() => {
    dom.toast.classList.remove('show');
  }, CONFIG.TOAST_DURATION);
}


/* ══════════════════════════════════════════════════
   FORMATAÇÃO AUTOMÁTICA
══════════════════════════════════════════════════ */

/**
 * Formata o telefone enquanto o usuário digita
 * @param {Event} e
 */
function formatarTelefone(e) {
  let val = e.target.value.replace(/\D/g, '');

  if (val.length > 11) val = val.slice(0, 11);

  if (val.length <= 10) {
    // Fixo: (XX) XXXX-XXXX
    val = val.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  } else {
    // Celular: (XX) XXXXX-XXXX
    val = val.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
  }

  e.target.value = val;
}

/**
 * Preenche automaticamente o valor ao escolher o serviço
 * @param {Event} e
 */
function autoPreencherValor(e) {
  const servico = e.target.value;
  if (servico && CONFIG.PRECOS[servico]) {
    dom.inputValor.value = CONFIG.PRECOS[servico];
  }
}


/* ══════════════════════════════════════════════════
   CHIPS DE SERVIÇO
══════════════════════════════════════════════════ */

/**
 * Gerencia a seleção dos chips de serviço
 * @param {Event} e
 */
function selecionarChip(e) {
  const chip = e.currentTarget;
  const servico = chip.dataset.service;
  const preco = chip.dataset.price;

  // Remove active de todos
  document.querySelectorAll('.service-chip').forEach(c => c.classList.remove('active'));

  // Ativa o clicado
  chip.classList.add('active');

  // Atualiza o estado
  state.servicoAtivo = servico;

  // Se modal estiver aberto, atualiza os campos
  if (dom.overlay.classList.contains('active')) {
    dom.inputServico.value = servico;
    dom.inputValor.value = CONFIG.PRECOS[servico] || '';
  }
}


/* ══════════════════════════════════════════════════
   BIND DE EVENTOS
══════════════════════════════════════════════════ */

/**
 * Registra todos os event listeners da aplicação
 */
function bindEventos() {
  // Fechar modal — botão X
  dom.modalClose.addEventListener('click', fecharModal);

  // Fechar modal — clique no overlay (fora do sheet)
  dom.overlay.addEventListener('click', (e) => {
    if (e.target === dom.overlay) fecharModal();
  });

  // Fechar modal — tecla ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dom.overlay.classList.contains('active')) {
      fecharModal();
    }
  });

  // Botão confirmar agendamento
  dom.btnConfirm.addEventListener('click', confirmarAgendamento);

  // Formatação automática do telefone
  dom.inputTelefone.addEventListener('input', formatarTelefone);

  // Auto-preenchimento do valor ao mudar serviço
  dom.inputServico.addEventListener('change', autoPreencherValor);

  // Enter para confirmar (exceto no select)
  [dom.inputNome, dom.inputTelefone, dom.inputValor].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmarAgendamento();
    });
  });

  // Chips de serviço
  document.querySelectorAll('.service-chip').forEach(chip => {
    chip.addEventListener('click', selecionarChip);
  });
}


/* ══════════════════════════════════════════════════
   ARRANQUE
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', init);
