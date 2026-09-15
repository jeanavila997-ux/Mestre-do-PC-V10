# 🧪 Plano de Testes - Computer Use

## Pré-requisitos

```powershell
# 1. Instalar SDK
npm install @qwen-code/cua-sdk@0.20.4

# 2. Verificar instalação
npm list @qwen-code/cua-sdk

# 3. Iniciar launcher
npm start
```

## Teste 1: Health Check da API

**Objetivo:** Verificar se endpoints estão respondendo

```powershell
# Testar status
curl http://127.0.0.1:7777/computer-use/status

# Esperado:
{
  "connected": false,
  "pid": null,
  ...
}
```

**✅ Passa se:** Retorna JSON válido com status inicial

---

## Teste 2: Listar Aplicativos

**Objetivo:** Verificar se lista apps corretamente

### Via UI:
1. Acesse `http://127.0.0.1:7777`
2. Clique em **"📋 Listar Aplicativos"**
3. Verifique output no painel

### Via API:
```powershell
curl http://127.0.0.1:7777/computer-use/apps
```

**✅ Passa se:**
- Retorna array de aplicativos
- Cada app tem: name, pid, running
- Pelo menos 1 app está "running: true"

---

## Teste 3: Listar Janelas

**Objetivo:** Listar janelas de um app específico

### Passos:
1. Liste apps e anote um PID (ex: explorer.exe)
2. Execute:
```powershell
curl -X POST http://127.0.0.1:7777/computer-use/windows `
  -H "Content-Type: application/json" `
  -d '{"pid": PID_ANOTADO}'
```

**✅ Passa se:**
- Retorna array de janelas
- Cada janela tem: window_id, title, is_on_screen

---

## Teste 4: Observar Janela

**Objetivo:** Obter árvore de acessibilidade

### Passos:
1. Abra o **Bloco de Notas**
2. Anote o PID do Notepad
3. Execute:
```powershell
curl -X POST http://127.0.0.1:7777/computer-use/observe `
  -H "Content-Type: application/json" `
  -d '{"pid": PID_NOTEPAD, "disableDiff": true}'
```

**✅ Passa se:**
- Retorna objeto com: pid, windowId, text, elements
- `elements` é um array não vazio
- Cada elemento tem: element_token, role, label

---

## Teste 5: UI - Categoria Computer Use

**Objetivo:** Verificar se categoria aparece na UI

### Passos:
1. Acesse `http://127.0.0.1:7777`
2. Role até final do menu
3. Procure por **"🖱️ Computer Use"**

**✅ Passa se:**
- Categoria existe com ícone 🖱️
- Badge "NOVO V11" aparece
- 12 comandos listados

---

## Teste 6: UI - Listar Aplicativos

**Objetivo:** Teste end-to-end do comando

### Passos:
1. Clique em **"📋 Listar Aplicativos"**
2. Aguarde output no painel

**✅ Passa se:**
- Output mostra lista formatada
- Cada app tem nome, PID, status
- Toast "✅ Apps listados" aparece

---

## Teste 7: UI - Observar Janela

**Objetivo:** Testar modal de observação

### Passos:
1. Abra **Bloco de Notas**
2. Clique em **"👁️ Observar Janela (Árvore UX)"**
3. Informe PID do Notepad
4. Deixe Window ID em branco
5. Clique OK

**✅ Passa se:**
- Modal abre
- Barra lateral mostra resumo (botões, inputs, menus)
- Lista de elementos é renderizada
- Elementos têm botões: Click, Type, Actions

---

## Teste 8: UI - Barra Lateral

**Objetivo:** Verificar barra de resumo

### Passos:
1. Execute teste 7 (Observar Janela)
2. Verifique barra lateral esquerda

**✅ Passa se:**
- Mostra "📊 Resumo"
- Contador de Botões (🔘)
- Contador de Inputs (📝)
- Contador de Menus (🎯)
- Contador de Outros (📦)
- Total de elementos

---

## Teste 9: UI - Interação com Elemento

**Objetivo:** Clicar em elemento

### Passos:
1. No modal de observação
2. Localize um botão na lista
3. Clique em **"🖱️ Click"**

**✅ Passa se:**
- Toast "✅ Clique executado" aparece
- Modal fecha
- Elemento recebe clique (se visível)

---

## Teste 10: UI - Digitar Texto

**Objetivo:** Testar input de texto

### Passos:
1. No modal de observação
2. Localize elemento do tipo "edit" ou "textbox"
3. Clique em **"⌨️ Type"**
4. Digite: "Computer Use Test"
5. Clique OK

**✅ Passa se:**
- Prompt pede texto
- Toast "✅ Texto digitado" aparece
- Texto é inserido no elemento

---

## Teste 11: UI - Fechar Modal

**Objetivo:** Verificar fechamento do modal

### Passos:
1. Abra modal de observação
2. Clique em **"✕"** no topo

**✅ Passa se:**
- Modal fecha
- Overlay desaparece

---

## Teste 12: UI - Outros Comandos

**Objetivo:** Testar comandos restantes

### Comandos:
- [ ] 🖱️ Clicar
- [ ] ⌨️ Digitar Texto
- [ ] 🔘 Pressionar Tecla
- [ ] 📜 Scroll
- [ ] 📝 Definir Valor
- [ ] 🎯 Ação Secundária
- [ ] ⚡ Hotkey
- [ ] 🔒 Fechar Computer Use
- [ ] 📊 Status

**✅ Passa se:** Cada comando executa sem erro e mostra feedback

---

## Teste 13: Error Handling

**Objetivo:** Verificar tratamento de erros

### Casos:
1. Listar apps com launcher offline
2. Observar janela com PID inválido
3. Clicar sem elementToken

**✅ Passa se:**
- Mensagens de erro claras
- Toasts de erro (vermelhos)
- UI não quebra

---

## Teste 14: Performance

**Objetivo:** Medir tempo de resposta

### Métricas:
```
Listar Apps:        < 2s
Observar Janela:    < 3s
Clicar:             < 1s
Digitar:            < 1s
```

**✅ Passa se:** Todos dentro do limite

---

## Teste 15: Apps Reais

**Objetivo:** Testar com aplicativos reais

### Apps para testar:
- [ ] Bloco de Notas
- [ ] WordPad
- [ ] Explorador de Arquivos
- [ ] Chrome/Edge
- [ ] VS Code
- [ ] PowerShell

**✅ Passa se:**
- Observação funciona em cada app
- Elementos são listados
- Ações executam

---

## Checklist de Aceitação

### Backend
- [ ] Todos endpoints respondem
- [ ] Error handling funciona
- [ ] Status retorna estado correto
- [ ] Conexão é estabelecida

### Frontend
- [ ] Categoria Computer Use aparece
- [ ] 12 comandos listados
- [ ] Modal de observação abre
- [ ] Barra lateral funciona
- [ ] Elementos são renderizados
- [ ] Botões executam ações
- [ ] Toasts de feedback aparecem

### Integração
- [ ] UI ↔ API ↔ Backend funciona
- [ ] CORS configurado corretamente
- [ ] Headers são enviados
- [ ] Respostas são parseadas

### Documentação
- [ ] Quickstart está claro
- [ ] API docs completa
- [ ] Exemplos funcionam
- [ ] Troubleshooting ajuda

### Segurança
- [ ] Validação de PID
- [ ] Validação de elementToken
- [ ] Tratamento de erros
- [ ] Logs adequados

---

## Resultados Esperados

### ✅ Sucesso Total
- 15/15 testes passam
- Todos checkboxes marcados
- Nenhum erro crítico

### ⚠️ Sucesso Parcial
- 12-14/15 testes passam
- 1-2 erros não críticos
- Funcionalidade principal OK

### ❌ Falha
- < 12/15 testes passam
- Erros críticos
- Funcionalidade quebrada

---

## Script de Teste Automatizado (Futuro)

```powershell
# test-computer-use.ps1

Write-Host "🧪 Teste 1: Health Check..."
$status = Invoke-RestMethod http://127.0.0.1:7777/computer-use/status
if ($status.connected -eq $false) { Write-Host "✅ Pass" } else { Write-Host "❌ Fail" }

Write-Host "🧪 Teste 2: Listar Apps..."
$apps = Invoke-RestMethod http://127.0.0.1:7777/computer-use/apps
if ($apps.Count -gt 0) { Write-Host "✅ Pass" } else { Write-Host "❌ Fail" }

# ... mais testes
```

---

## Como Reportar Bugs

1. **Descreva o problema**
2. **Passos para reproduzir**
3. **Resultado esperado**
4. **Resultado atual**
5. **Screenshots** (se aplicável)
6. **Logs** (F12 → Console)

**Enviar para:** Jean Carlos de Avila
**Canal:** Issues do GitHub ou Chat

---

**Versão:** 1.0
**Data:** 2026-09-13
