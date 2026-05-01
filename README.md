# 💈 BarberSchedule — Sistema de Agendamento para Barbearia

> Sistema completo de agendamento online com integração ao Google Sheets.
> Interface estilo aplicativo mobile, tema escuro com laranja, pronto para uso real.

---

## ✅ O que foi corrigido nesta versão

**Problema anterior:** Os agendamentos ficavam salvos apenas na memória do navegador de cada usuário. Quando outro usuário abria o link, os horários ocupados apareciam como disponíveis.

**Correção implementada:**
1. **GET centralizado** — ao carregar, o app busca todos os horários ocupados diretamente da planilha Google Sheets
2. **POST com controle de concorrência** — antes de gravar, o backend verifica se o horário ainda está disponível usando `LockService` (exclusão mútua)
3. **Polling a cada 30 segundos** — garante que agendamentos feitos por outros usuários apareçam automaticamente
4. **Resposta tratável** — removido `mode: 'no-cors'` no POST, permitindo que o frontend leia a resposta e detecte conflitos

---

## 🗂️ Estrutura do Projeto

```
barbearia-agendamento/
├── index.html              → Estrutura e marcação HTML (inalterado)
├── style.css               → Estilos, animações e tema dark (inalterado)
├── script.js               → Lógica frontend — ATUALIZADO
├── google-apps-script.js   → Backend Google Apps Script — ATUALIZADO
└── README.md               → Este arquivo
```

---

## 🚀 Como Configurar

### Passo 1 — Criar a Planilha

1. Acesse [sheets.google.com](https://sheets.google.com) e crie uma nova planilha
2. Na primeira linha, adicione os cabeçalhos:
   ```
   Nome | Horário | Data | Valor | Telefone | Tipo de serviço
   ```

### Passo 2 — Configurar o Google Apps Script

1. Na planilha, vá em **Extensões → Apps Script**
2. Apague o código existente e cole o conteúdo do arquivo `google-apps-script.js`
3. Salve (Ctrl+S)

### Passo 3 — Publicar como Aplicativo Web

1. Clique em **Implantar → Nova implantação**
2. Tipo: **Aplicativo da Web**
3. Executar como: **Eu** (sua conta)
4. Quem pode acessar: **Qualquer pessoa**
5. Clique em **Implantar** e copie a URL gerada

### Passo 4 — Atualizar o script.js

Abra `script.js` e substitua a URL em `CONFIG.SHEETS_ENDPOINT`:

```javascript
const CONFIG = {
  SHEETS_ENDPOINT: 'https://script.google.com/macros/s/SUA_URL_AQUI/exec',
  // ...
};
```

---

## 🔄 Como funciona a nova lógica

```
CARREGAR PÁGINA
     │
     ▼
GET ?acao=listar&data=hoje
     │
     ▼
Backend lê planilha → retorna ['09:00', '14:00', ...]
     │
     ▼
Frontend marca slots ocupados na grade
     │
     ▼
[A cada 30s] → repete GET → atualiza grade se mudou

─────────────────────────────────────────────

USUÁRIO CLICA EM HORÁRIO → preenche modal → clica Confirmar
     │
     ▼
Checagem rápida local (já ocupado? → avisa e fecha)
     │
     ▼
POST { acao: 'agendar', horario, data, nome, ... }
     │
     ▼
Backend adquire LockService (exclusão mútua)
     │
     ▼
Re-verifica planilha (horário ainda livre?)
     ├── SIM → appendRow → retorna { status: 'ok' }
     └── NÃO → retorna { status: 'conflito' }
     │
     ▼
Frontend processa resposta:
  'ok'       → marca slot visualmente + toast ✅
  'conflito' → avisa usuário + sincroniza grade ⚠️
  erro HTTP  → toast de erro ❌
```

---

## 📊 Integração com Google Sheets

### Planilha — Colunas Esperadas

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Nome | Horário | Data | Valor | Telefone | Tipo de serviço |

### Endpoints do Backend

| Método | Parâmetros | Resposta |
|--------|-----------|----------|
| GET | `?acao=listar&data=DD/MM/AAAA` | `{ status: 'ok', horariosOcupados: [...] }` |
| POST | `{ acao: 'agendar', nome, horario, data, valor, telefone, tipoServico }` | `{ status: 'ok' \| 'conflito' \| 'erro' }` |

---

## 📱 Publicar no GitHub Pages (gratuito)

```bash
git init
git add .
git commit -m "feat: sistema de agendamento com persistência centralizada"
git remote add origin https://github.com/SEU_USUARIO/barbearia-agendamento.git
git push -u origin main
# Ative GitHub Pages em: Repositório → Settings → Pages → Source: main branch
```

---

## 📦 Tecnologias

| Tecnologia | Uso |
|---|---|
| HTML5 | Estrutura semântica |
| CSS3 | Tema dark, animações |
| JavaScript ES2021 | Lógica frontend, Fetch API, polling |
| Google Apps Script | Backend serverless com LockService |
| Google Sheets | Banco de dados centralizado |

---

Feito com ❤️ para barbeiros modernos 💈
