/* ════════════════════════════════════════════════════
   BarberSchedule — script.js
   Lógica completa do sistema de agendamento

   CORREÇÃO CRÍTICA: Persistência centralizada via Google Sheets
   - Horários ocupados são buscados do servidor ao carregar a página
   - Novo agendamento é validado no backend antes de confirmar
   - Polling a cada 30s para manter a interface atualizada
════════════════════════════════════════════════════ */

'use strict';

/* ── CONFIGURAÇÕES ─────────────────────────────────
   Altere aqui para personalizar facilmente o sistema
─────────────────────────────────────────────────── */
const CONFIG = {
  // Endpoint do Google Apps Script (deve suportar GET e POST)
  // Veja o arquivo google-apps-script.js para o código do backend atualizado
  SHEETS_ENDPOINT: 'https://script.google.com/macros/s/AKfycbzkrjbB7F3CX4vFjya5IG0miXV35puuM2VzcJMq8MEup7UNbck3yt7RE6hy6FR0huUv/exec',

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

  // Intervalo de polling para atualizar horários (ms) — 30 segundos
  POLLING_INTERVAL: 30_000,
};

/* ── ESTADO DA APLICAÇÃO ────────────────────────── */
const state = {
  horarioSelecionado: null,      // Horário clicado pelo usuário
  horariosOcupados: new Set(),   // Horários já agendados (sincronizado com o servidor)
  servicoAtivo: 'Corte Simples', // Serviço selecionado nos chips
  pollingTimer: null,            // Referência ao setInterval de polling
  carregando: false,             // Flag para evitar duplo envio simultâneo
};

/* ── REFERÊNCIAS DOM ────────────────────────────── */
const dom = {
  statusTime:       document.getElementById('statusTime'),
  headerDay:        document.getElementById('headerDay'),
  headerDate:       document.getElementById('headerDate'),
  slotsCount:       document.getElementById('slotsCount'),
  slotsGrid:        document.getElementById('slotsGrid'),
  overlay:          document.getElementById('modalOverlay'),
  sheet:            document.getElementById('modalSheet'),
  modalClose:       document.getElementById('modalClose'),
  modalTimeDisplay: document.getElementById('modalTimeDisplay'),
  inputNome:        document.getElementById('inputNome'),
  inputTelefone:    document.getElementById('inputTelefone'),
  inputServico:     document.getElementById('inputServico'),
  inputValor:       document.getElementById('inputValor'),
  summaryData:      document.getElementById('summaryData'),
  summaryHorario:   document.getElementById('summaryHorario'),
  btnConfirm:       document.getElementById('btnConfirm'),
  btnLoader:        document.getElementById('btnLoader'),
  toast:            document.getElementById('toast'),
  toastMsg:         document.getElementById('toastMsg'),
  toastIcon:        document.getElementById('toastIcon'),
};


/* ══════════════════════════════════════════════════
   INICIALIZAÇÃO
══════════════════════════════════════════════════ */
async function init() {
  atualizarRelogio();
  atualizarDataHeader();

  // Renderiza grade inicial enquanto busca dados do servidor
  renderizarSlots();
  bindEventos();

  // Busca horários ocupados do servidor (fonte de verdade centralizada)
  await sincronizarHorariosOcupados();

  // Inicia polling para atualizar se outro usuário agendar
  iniciarPolling();

  setInterval(atualizarRelogio, 30_000);
}


/* ══════════════════════════════════════════════════
   SINCRONIZAÇÃO COM O SERVIDOR — GET
   Busca os horários já agendados centralizados na planilha
══════════════════════════════════════════════════ */

/**
 * Consulta o Google Sheets para obter todos os horários ocupados hoje.
 * Atualiza state.horariosOcupados e re-renderiza a grade se houve mudança.
 */
async function sincronizarHorariosOcupados() {
  try {
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    // Parâmetro ?acao=listar&data=DD/MM/AAAA — backend filtra por data
    const url = `${CONFIG.SHEETS_ENDPOINT}?acao=listar&data=${encodeURIComponent(dataHoje)}`;

    const resposta = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

    const dados = await resposta.json();

    // Backend retorna: { status: 'ok', horariosOcupados: ['09:00', '11:00', ...] }
    if (dados.status === 'ok' && Array.isArray(dados.horariosOcupados)) {
      const anterior = new Set(state.horariosOcupados);
      state.horariosOcupados = new Set(dados.horariosOcupados);

      // Re-renderiza apenas se houve mudança real (evita piscar)
      if (!setsIguais(anterior, state.horariosOcupados)) {
        renderizarSlots();
      }
    }
  } catch (err) {
    // Não trava a interface — continua com o estado atual
    console.warn('[BarberSchedule] Falha ao sincronizar horários:', err.message);
  }
}

/** Compara dois Sets por igualdade de conteúdo */
function setsIguais(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

/**
 * Inicia o polling periódico.
 * Garante que agendamentos feitos por outros usuários apareçam em até 30s.
 */
function iniciarPolling() {
  if (state.pollingTimer) clearInterval(state.pollingTimer);

  state.pollingTimer = setInterval(async () => {
    // Não faz polling enquanto o modal está aberto (usuário pode estar preenchendo)
    if (!dom.overlay.classList.contains('active')) {
      await sincronizarHorariosOcupados();
    }
  }, CONFIG.POLLING_INTERVAL);
}


/* ══════════════════════════════════════════════════
   RELÓGIO E DATA
══════════════════════════════════════════════════ */

function atualizarRelogio() {
  const agora = new Date();
  const hh = String(agora.getHours()).padStart(2, '0');
  const mm = String(agora.getMinutes()).padStart(2, '0');
  dom.statusTime.textContent = `${hh}:${mm}`;
}

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
   RENDERIZAÇÃO DOS SLOTS
══════════════════════════════════════════════════ */

/**
 * Renderiza toda a grade de horários com base em state.horariosOcupados,
 * que agora é sempre sincronizado com o servidor.
 */
function renderizarSlots() {
  dom.slotsGrid.innerHTML = '';
  CONFIG.HORARIOS.forEach((horario, index) => {
    dom.slotsGrid.appendChild(criarBotaoSlot(horario, index));
  });
  atualizarContadorSlots();
}

function criarBotaoSlot(horario, index) {
  const ocupado = state.horariosOcupados.has(horario);
  const periodo = getPeriodo(horario);

  const btn = document.createElement('button');
  btn.classList.add('slot-btn');
  if (ocupado) btn.classList.add('booked');
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

function getPeriodo(horario) {
  const hora = parseInt(horario.split(':')[0], 10);
  if (hora < 12) return 'Manhã';
  if (hora < 18) return 'Tarde';
  return 'Noite';
}

function atualizarContadorSlots() {
  const disponíveis = CONFIG.HORARIOS.length - state.horariosOcupados.size;
  dom.slotsCount.textContent = `${disponíveis} horário${disponíveis !== 1 ? 's' : ''}`;
}


/* ══════════════════════════════════════════════════
   MODAL — ABRIR / FECHAR
══════════════════════════════════════════════════ */

function abrirModal(horario, btn) {
  state.horarioSelecionado = horario;
  dom.modalTimeDisplay.textContent = horario;
  dom.summaryHorario.textContent = horario;
  dom.inputServico.value = state.servicoAtivo;
  dom.inputValor.value = CONFIG.PRECOS[state.servicoAtivo] || '';
  dom.inputNome.value = '';
  dom.inputTelefone.value = '';
  limparErros();
  dom.overlay.classList.add('active');
  dom.overlay.setAttribute('aria-hidden', 'false');
  setTimeout(() => dom.inputNome.focus(), 350);
}

function fecharModal() {
  dom.overlay.classList.remove('active');
  dom.overlay.setAttribute('aria-hidden', 'true');
  state.horarioSelecionado = null;
  state.carregando = false;
  restaurarBotaoConfirmar();
}


/* ══════════════════════════════════════════════════
   VALIDAÇÃO DO FORMULÁRIO
══════════════════════════════════════════════════ */

function validarFormulario() {
  limparErros();
  const nome     = dom.inputNome.value.trim();
  const telefone = dom.inputTelefone.value.trim();
  const servico  = dom.inputServico.value;
  const valor    = dom.inputValor.value.trim();
  let valido = true;

  if (nome.length < 2)          { marcarErro(dom.inputNome, 'Informe seu nome completo'); valido = false; }
  if (!validarTelefone(telefone)){ marcarErro(dom.inputTelefone, 'Informe um telefone válido'); valido = false; }
  if (!servico)                  { marcarErro(dom.inputServico, 'Selecione o tipo de serviço'); valido = false; }
  if (!valor)                    { marcarErro(dom.inputValor, 'Informe o valor do serviço'); valido = false; }

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

function validarTelefone(tel) {
  const limpo = tel.replace(/\D/g, '');
  return limpo.length >= 10 && limpo.length <= 11;
}

function marcarErro(input, mensagem) {
  input.classList.add('error');
  if (!input.nextElementSibling?.classList?.contains('error-msg')) {
    const msg = document.createElement('span');
    msg.classList.add('field-hint', 'error-msg');
    msg.style.color = 'var(--clr-error)';
    msg.textContent = mensagem;
    input.insertAdjacentElement('afterend', msg);
  }
}

function limparErros() {
  document.querySelectorAll('.field-input.error').forEach(el => el.classList.remove('error'));
  document.querySelectorAll('.error-msg').forEach(el => el.remove());
}


/* ══════════════════════════════════════════════════
   ENVIO PARA O GOOGLE SHEETS — POST com controle de concorrência
══════════════════════════════════════════════════ */

/**
 * Fluxo de confirmação — estratégia "POST fire-and-forget + confirmar via GET":
 *
 * O Google Apps Script NÃO permite ler a resposta de um POST cross-origin.
 * Qualquer tentativa de res.json() após um POST resulta em erro CORS/opaque.
 *
 * Solução:
 *  1. Envia o POST com mode:'no-cors' (fire-and-forget — não tenta ler resposta)
 *  2. Aguarda 2s para o Apps Script processar
 *  3. Faz um GET para verificar se o horário apareceu na planilha
 *  4. Se o horário constar como ocupado → sucesso confirmado
 *     Se não constar após 3 tentativas → erro real
 */
async function confirmarAgendamento() {
  if (state.carregando) return;

  const { valido, dados } = validarFormulario();
  if (!valido) return;

  if (state.horariosOcupados.has(dados.horario)) {
    exibirToast('⚠️ Este horário foi ocupado. Escolha outro.', 'error');
    fecharModal();
    await sincronizarHorariosOcupados();
    return;
  }

  state.carregando = true;
  iniciarCarregamento();

  try {
    // Passo 1: envia o POST (não tenta ler a resposta — CORS impede)
    await enviarAgendamento(dados);

    // Passo 2: aguarda o Apps Script processar e confirma via GET
    const confirmado = await confirmarViaGet(dados.horario, dados.data);

    if (confirmado) {
      state.horariosOcupados.add(dados.horario);
      fecharModal();
      marcarSlotComoOcupado(dados.horario);
      exibirToast(`✅ ${dados.nome}, horário ${dados.horario} confirmado!`, 'success');
      atualizarContadorSlots();
    } else {
      restaurarBotaoConfirmar();
      exibirToast('❌ Não foi possível confirmar o agendamento. Tente novamente.', 'error');
    }

  } catch (err) {
    console.error('[BarberSchedule] Erro ao confirmar agendamento:', err);
    restaurarBotaoConfirmar();
    exibirToast('❌ Erro de conexão. Verifique sua internet e tente novamente.', 'error');
  } finally {
    state.carregando = false;
  }
}

/**
 * Envia os dados ao Apps Script via POST com mode:'no-cors'.
 *
 * Com no-cors o navegador envia a requisição normalmente, mas retorna
 * uma resposta opaca — não podemos ler status nem body. Isso é esperado
 * e correto. A confirmação é feita pelo GET em seguida.
 */
async function enviarAgendamento(dados) {
  await fetch(CONFIG.SHEETS_ENDPOINT, {
    method: 'POST',
    mode: 'no-cors', // Necessário para Apps Script — resposta será opaca (não lemos)
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      acao:        'agendar',
      nome:        dados.nome,
      horario:     dados.horario,
      data:        dados.data,
      valor:       dados.valor,
      telefone:    dados.telefone,
      tipoServico: dados.tipoServico,
    }),
  });
  // Não verifica resposta aqui — é opaca por design. Confirmação feita via GET.
}

/**
 * Verifica via GET se o horário foi gravado na planilha.
 * Tenta até 3 vezes com intervalo crescente (2s, 3s, 4s) antes de desistir.
 *
 * @param {string} horario - ex: '09:00'
 * @param {string} data    - ex: '01/05/2026'
 * @returns {Promise<boolean>}
 */
async function confirmarViaGet(horario, data) {
  const tentativas = [2000, 3000, 4000]; // Aguarda antes de cada tentativa (ms)

  for (const espera of tentativas) {
    await new Promise(r => setTimeout(r, espera));

    try {
      const url = `${CONFIG.SHEETS_ENDPOINT}?acao=listar&data=${encodeURIComponent(data)}`;
      const resposta = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (!resposta.ok) continue;

      const dados = await resposta.json();
      if (dados.status === 'ok' && Array.isArray(dados.horariosOcupados)) {
        // Atualiza o estado global com os dados mais recentes
        state.horariosOcupados = new Set(dados.horariosOcupados);
        if (dados.horariosOcupados.includes(horario)) {
          return true; // Confirmado — horário apareceu na planilha
        }
      }
    } catch (_) {
      // Continua para a próxima tentativa
    }
  }

  return false; // Não confirmado após todas as tentativas
}


/* ══════════════════════════════════════════════════
   ATUALIZAÇÃO DE UI
══════════════════════════════════════════════════ */

function iniciarCarregamento() {
  dom.btnConfirm.disabled = true;
  dom.btnConfirm.querySelector('.btn-text').hidden = true;
  dom.btnLoader.hidden = false;
}

function restaurarBotaoConfirmar() {
  dom.btnConfirm.disabled = false;
  dom.btnConfirm.querySelector('.btn-text').hidden = false;
  dom.btnLoader.hidden = true;
}

function marcarSlotComoOcupado(horario) {
  const btn = dom.slotsGrid.querySelector(`[data-horario="${horario}"]`);
  if (!btn) return;
  btn.classList.add('just-booked');
  setTimeout(() => {
    const index = CONFIG.HORARIOS.indexOf(horario);
    const novoBotao = criarBotaoSlot(horario, index);
    novoBotao.style.animationDelay = '0ms';
    btn.replaceWith(novoBotao);
  }, 500);
}

function exibirToast(mensagem, tipo = 'success') {
  dom.toastMsg.textContent = mensagem;
  dom.toast.className = `toast ${tipo} show`;
  clearTimeout(dom.toast._timeout);
  dom.toast._timeout = setTimeout(() => {
    dom.toast.classList.remove('show');
  }, CONFIG.TOAST_DURATION);
}


/* ══════════════════════════════════════════════════
   FORMATAÇÃO AUTOMÁTICA
══════════════════════════════════════════════════ */

function formatarTelefone(e) {
  let val = e.target.value.replace(/\D/g, '');
  if (val.length > 11) val = val.slice(0, 11);
  if (val.length <= 10) {
    val = val.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  } else {
    val = val.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
  }
  e.target.value = val;
}

function autoPreencherValor(e) {
  const servico = e.target.value;
  if (servico && CONFIG.PRECOS[servico]) {
    dom.inputValor.value = CONFIG.PRECOS[servico];
  }
}


/* ══════════════════════════════════════════════════
   CHIPS DE SERVIÇO
══════════════════════════════════════════════════ */

function selecionarChip(e) {
  const chip = e.currentTarget;
  document.querySelectorAll('.service-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  state.servicoAtivo = chip.dataset.service;
  if (dom.overlay.classList.contains('active')) {
    dom.inputServico.value = chip.dataset.service;
    dom.inputValor.value = CONFIG.PRECOS[chip.dataset.service] || '';
  }
}


/* ══════════════════════════════════════════════════
   BIND DE EVENTOS
══════════════════════════════════════════════════ */

function bindEventos() {
  dom.modalClose.addEventListener('click', fecharModal);
  dom.overlay.addEventListener('click', (e) => {
    if (e.target === dom.overlay) fecharModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dom.overlay.classList.contains('active')) fecharModal();
  });
  dom.btnConfirm.addEventListener('click', confirmarAgendamento);
  dom.inputTelefone.addEventListener('input', formatarTelefone);
  dom.inputServico.addEventListener('change', autoPreencherValor);
  [dom.inputNome, dom.inputTelefone, dom.inputValor].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmarAgendamento();
    });
  });
  document.querySelectorAll('.service-chip').forEach(chip => {
    chip.addEventListener('click', selecionarChip);
  });
}


/* ══════════════════════════════════════════════════
   ARRANQUE
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', init);
