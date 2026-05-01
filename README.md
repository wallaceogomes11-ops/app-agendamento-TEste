# 💈 BarberSchedule — Sistema de Agendamento para Barbearia

> Sistema completo de agendamento online com integração ao Google Sheets.  
> Interface estilo aplicativo mobile, tema escuro com laranja, pronto para uso real.

---

## 📸 Visão Geral

- ✅ Grade de horários clicáveis (09h–18h)
- ✅ Modal elegante para preenchimento dos dados do cliente
- ✅ Envio automático para planilha Google Sheets
- ✅ Feedback visual de sucesso e erro
- ✅ Funcionamento 100% offline-ready (apenas a integração com Sheets requer internet)
- ✅ Responsivo — funciona perfeitamente no celular

---

## 🗂️ Estrutura do Projeto

```
barbearia-agendamento/
├── index.html   → Estrutura e marcação HTML
├── style.css    → Estilos, animações e tema dark
├── script.js    → Lógica, validação e integração
└── README.md    → Este arquivo
```

---

## 🚀 Como Usar

### 1. Abrir no Navegador

Basta abrir o arquivo `index.html` diretamente no navegador:

```bash
# Opção 1 — arrastar o arquivo para o Chrome/Firefox
# Opção 2 — via terminal:
open index.html           # macOS
start index.html          # Windows
xdg-open index.html       # Linux
```

Nenhum servidor local é necessário.

---

### 2. Fluxo do Cliente

1. **Escolhe o serviço** no carrossel de chips (Corte, Barba, Combo…)
2. **Clica no horário** desejado na grade
3. **Preenche os dados** no modal (nome, telefone, serviço, valor)
4. **Clica em "Confirmar Agendamento"**
5. O horário some da tela e o dado é enviado para a planilha ✅

---

## 📊 Integração com Google Sheets

### Planilha — Colunas Esperadas

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Nome | Horário | Data | Valor | Telefone | Tipo de serviço |

### Endpoint configurado

O sistema já usa o endpoint:

```
https://script.google.com/macros/s/AKfycbzkrjbB7F3CX4vFjya5IG0miXV35puuM2VzcJMq8MEup7UNbck3yt7RE6hy6FR0huUv/exec
```

Se quiser usar **sua própria planilha**, siga o passo a passo abaixo.

---

## 🔧 Como Configurar Sua Própria Planilha

### Passo 1 — Criar a Planilha

1. Acesse [sheets.google.com](https://sheets.google.com) e crie uma nova planilha
2. Na primeira linha, adicione os cabeçalhos:
   ```
   Nome | Horário | Data | Valor | Telefone | Tipo de serviço
   ```

### Passo 2 — Criar o Google Apps Script

1. Na planilha, vá em **Extensões → Apps Script**
2. Apague o código existente e cole o seguinte:

```javascript
// Recebe agendamentos (POST) e os grava na planilha
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var dados = JSON.parse(e.postData.contents);

    sheet.appendRow([
      dados.nome        || '',
      dados.horario     || '',
      dados.data        || '',
      dados.valor       || '',
      dados.telefone    || '',
      dados.tipoServico || '',
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', mensagem: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Trata GET: grava agendamento OU retorna horários ocupados
// O parâmetro "acao=agendar" decide o que fazer
function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var params = e.parameter;

  // ── GRAVAR AGENDAMENTO ──────────────────────────────
  if (params.acao === "agendar") {
    try {
      sheet.appendRow([
        params.nome        || "",
        params.horario     || "",
        params.data        || "",
        params.valor       || "",
        params.telefone    || "",
        params.tipoServico || "",
      ]);

      return ContentService
        .createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: "error", mensagem: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ── LISTAR HORÁRIOS OCUPADOS (padrão) ───────────────
  var dados = sheet.getDataRange().getValues();
  var horariosOcupados = [];

  // i=1 para pular a linha de cabeçalho
  for (var i = 1; i < dados.length; i++) {
    var horario = dados[i][1]; // coluna B = Horário
    if (horario) horariosOcupados.push(String(horario).trim());
  }

  return ContentService
    .createTextOutput(JSON.stringify(horariosOcupados))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### Passo 3 — Publicar como Aplicativo Web

1. Clique em **Implantar → Nova implantação**
2. Tipo: **Aplicativo da Web**
3. Executar como: **Eu** (sua conta)
4. Quem pode acessar: **Qualquer pessoa**
5. Clique em **Implantar** e copie a URL gerada

### Passo 4 — Atualizar o script.js

Abra `script.js` e substitua a URL na constante `SHEETS_ENDPOINT`:

```javascript
const CONFIG = {
  SHEETS_ENDPOINT: 'https://script.google.com/macros/s/SUA_URL_AQUI/exec',
  // ...
};
```

---

## 🎨 Personalização

### Alterar Horários Disponíveis

Em `script.js`, edite o array `HORARIOS`:

```javascript
HORARIOS: [
  '08:00', '09:00', '10:00',
  // adicione ou remova conforme necessário
  '17:00', '18:00', '19:00',
],
```

### Alterar Serviços e Preços

Em `script.js`, edite o objeto `PRECOS`:

```javascript
PRECOS: {
  'Corte Degradê':  '45,00',
  'Barba Completa': '30,00',
  'Sobrancelha':    '15,00',
},
```

Lembre-se de também atualizar as opções no `<select>` e nos chips dentro do `index.html`.

### Alterar Cores

Em `style.css`, edite as variáveis CSS na seção `:root`:

```css
:root {
  --clr-orange: #ff6b1a;   /* cor principal — laranja */
  --clr-bg:     #0a0a0a;   /* fundo escuro */
}
```

---

## 🧪 Como Testar

### Teste Local (sem internet)

Abra `index.html` no navegador. O sistema funciona completamente — o único passo que requer internet é o envio para o Google Sheets. Se não houver conexão, o erro será capturado e exibido no toast de notificação.

### Teste do Envio para Sheets

1. Preencha todos os campos do modal
2. Clique em "Confirmar Agendamento"
3. Aguarde o spinner desaparecer
4. Verifique a planilha Google Sheets — uma nova linha deve aparecer

> **Nota:** A requisição usa `mode: 'no-cors'` porque o Google Apps Script bloqueia o header CORS por padrão. Isso significa que o JavaScript não consegue ler a resposta da API, mas o dado **é enviado e salvo normalmente** na planilha. Para confirmar o recebimento, verifique diretamente a planilha.

---

## 📱 Publicar no GitHub Pages (gratuito)

```bash
# 1. Inicialize o repositório
git init
git add .
git commit -m "feat: sistema de agendamento barbearia"

# 2. Crie um repositório no GitHub e envie
git remote add origin https://github.com/SEU_USUARIO/barbearia-agendamento.git
git push -u origin main

# 3. Ative o GitHub Pages
# Acesse: Repositório → Settings → Pages → Source: main branch
# O site ficará em: https://SEU_USUARIO.github.io/barbearia-agendamento
```

---

## 📦 Tecnologias

| Tecnologia | Uso |
|---|---|
| HTML5 | Estrutura semântica e acessível |
| CSS3 | Variáveis, Grid, Flexbox, animações, backdrop-filter |
| JavaScript ES2021 | Lógica, DOM, Fetch API, async/await |
| Google Apps Script | Backend serverless para salvar na planilha |
| Google Sheets | Banco de dados dos agendamentos |
| Google Fonts | Bebas Neue + DM Sans |

---

## 🔒 Observações de Segurança

- Este sistema é projetado para uso em **redes internas ou via GitHub Pages públicos**
- A URL do Apps Script é pública — qualquer pessoa com a URL pode enviar dados à planilha
- Para uso em produção real, considere adicionar validação de reCAPTCHA ou rate limiting no Apps Script
- Não armazene dados sensíveis além dos informados no formulário

---

## 📄 Licença

MIT — use livremente, modifique à vontade.

---

Feito com ❤️ para barbeiros modernos 💈
