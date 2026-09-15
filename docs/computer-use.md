# Computer Use - Mestre do PC V11

## Visão Geral

O **Computer Use** integra o `@qwen-code/cua-sdk` ao Mestre do PC, permitindo controle da interface do Windows através de acessibilidade. Você pode:

- 📋 Listar aplicativos em execução
- 🪟 Listar janelas de um aplicativo
- 👁️ Observar elementos de UI (árvore de acessibilidade)
- 🖱️ Clicar em elementos ou coordenadas
- ⌨️ Digitar texto
- 🔘 Pressionar teclas
- 📜 Fazer scroll
- 📝 Definir valores em inputs
- 🎯 Executar ações secundárias (menus, expandir, etc.)
- ⚡ Executar hotkeys

## Instalação

### 1. Instalar o SDK

```bash
cd "C:\Users\JEANPC\MESTRE DO PC\Mestre-do-PC-V10"
npm install @qwen-code/cua-sdk@0.20.4
```

### 2. Verificar Instalação

```bash
npm list @qwen-code/cua-sdk
```

## Uso na UI

### Pelo Menu Principal

1. Acesse `http://127.0.0.1:7777`
2. Navegue até a categoria **"🖱️ Computer Use"**
3. Execute os comandos:

#### Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| 📋 Listar Aplicativos | Lista todos os apps disponíveis |
| 🪟 Listar Janelas (por PID) | Lista janelas de um app específico |
| 👁️ Observar Janela (Árvore UX) | Mostra elementos interativos com botões de ação |
| 🖱️ Clicar (Elemento/Coordenada) | Executa clique |
| ⌨️ Digitar Texto | Digita texto em elemento |
| 🔘 Pressionar Tecla | Pressiona uma tecla específica |
| 📜 Scroll (Cima/Baixo) | Executa scroll na direção especificada |
| 📝 Definir Valor (Input) | Define valor em input/textarea |
| 🎯 Ação Secundária (Menu) | Executa ação secundária (ex: Show Menu) |
| ⚡ Hotkey (Atalho) | Executa combinação de teclas |
| 🔒 Fechar Computer Use | Encerra sessão |
| 📊 Status do Computer Use | Mostra status da conexão |

### Fluxo Recomendado

1. **Listar Apps** → Descobrir PID do aplicativo desejado
2. **Listar Janelas** → Identificar Window ID
3. **Observar Janela** → Ver elementos interativos
4. **Clicar/Digitar** → Executar ações nos elementos

## API REST

### Endpoints

#### GET `/computer-use/status`
Retorna status da conexão.

```json
{
  "connected": false,
  "pid": null,
  "windowId": null,
  "lastObservation": null,
  "elements": [],
  "error": null
}
```

#### GET `/computer-use/apps`
Lista aplicativos disponíveis.

**Query params:**
- `refresh=true` - Força atualização do cache

**Resposta:**
```json
[
  {
    "name": "Notepad",
    "bundle_id": null,
    "pid": 12345,
    "running": true,
    "launch_path": "C:\\Windows\\System32\\notepad.exe"
  }
]
```

#### POST `/computer-use/windows`
Lista janelas de um aplicativo.

**Body:**
```json
{ "pid": 12345 }
```

**Resposta:**
```json
[
  {
    "window_id": 67890,
    "title": "Sem Título - Bloco de Notas",
    "is_on_screen": true,
    "on_current_space": true
  }
]
```

#### POST `/computer-use/observe`
Observa estado de uma janela (árvore de acessibilidade).

**Body:**
```json
{
  "pid": 12345,
  "windowId": 67890,
  "includeScreenshot": false,
  "disableDiff": true
}
```

**Resposta:**
```json
{
  "pid": 12345,
  "windowId": 67890,
  "mode": "full",
  "text": "Árvore de acessibilidade...",
  "elements": [
    {
      "element_token": "elem_123",
      "role": "button",
      "label": "Salvar",
      "value": null,
      "actions": []
    }
  ],
  "screenshot": null
}
```

#### POST `/computer-use/click`
Executa clique em elemento ou coordenada.

**Body (por elemento):**
```json
{
  "pid": 12345,
  "windowId": 67890,
  "elementToken": "elem_123"
}
```

**Body (por coordenada):**
```json
{
  "pid": 12345,
  "windowId": 67890,
  "x": 100,
  "y": 200
}
```

#### POST `/computer-use/type`
Digita texto em elemento.

**Body:**
```json
{
  "pid": 12345,
  "windowId": 67890,
  "elementToken": "elem_123",
  "text": "Olá Mundo"
}
```

#### POST `/computer-use/press-key`
Pressiona uma tecla.

**Body:**
```json
{
  "pid": 12345,
  "windowId": 67890,
  "elementToken": "elem_123",
  "key": "Enter",
  "modifiers": ["Ctrl"]
}
```

#### POST `/computer-use/scroll`
Executa scroll.

**Body:**
```json
{
  "pid": 12345,
  "windowId": 67890,
  "elementToken": "elem_123",
  "direction": "down",
  "amount": 1
}
```

**Direções válidas:** `up`, `down`, `left`, `right`

#### POST `/computer-use/set-value`
Define valor em elemento (input, textarea).

**Body:**
```json
{
  "pid": 12345,
  "windowId": 67890,
  "elementToken": "elem_123",
  "value": "novo valor"
}
```

#### POST `/computer-use/secondary-action`
Executa ação secundária (menu, expandir, etc.).

**Body:**
```json
{
  "pid": 12345,
  "windowId": 67890,
  "elementToken": "elem_123",
  "action": "Show Menu"
}
```

**Ações comuns:** `Show Menu`, `Expand`, `Collapse`, `Select`, `Deselect`

#### POST `/computer-use/hotkey`
Executa combinação de teclas.

**Body:**
```json
{
  "pid": 12345,
  "windowId": 67890,
  "elementToken": "elem_123",
  "keys": ["Ctrl", "C"]
}
```

#### POST `/computer-use/close`
Fecha sessão do Computer Use.

**Resposta:**
```json
{ "status": "closed" }
```

## Exemplos de Uso

### Exemplo 1: Abrir Notepad e Digitar

```javascript
// 1. Listar apps para encontrar PID do Notepad
const apps = await fetch('http://127.0.0.1:7777/computer-use/apps');

// 2. Observar janela do Notepad
const state = await fetch('http://127.0.0.1:7777/computer-use/observe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pid: 12345, disableDiff: true })
});

// 3. Digitar texto
await fetch('http://127.0.0.1:7777/computer-use/type', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pid: 12345,
    text: 'Olá Mestre do PC!'
  })
});
```

### Exemplo 2: Clicar em Botão

```javascript
// Após observar e encontrar element_token
await fetch('http://127.0.0.1:7777/computer-use/click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pid: 12345,
    windowId: 67890,
    elementToken: 'button_save_123'
  })
});
```

### Exemplo 3: Atalho Ctrl+S (Salvar)

```javascript
await fetch('http://127.0.0.1:7777/computer-use/hotkey', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pid: 12345,
    keys: ['Ctrl', 'S']
  })
});
```

## Troubleshooting

### "Computer Use não está instalado"

Execute:
```bash
npm install @qwen-code/cua-sdk@0.20.4
```

### "PID é obrigatório"

Você precisa primeiro listar os apps para descobrir o PID:
```bash
curl http://127.0.0.1:7777/computer-use/apps
```

### "Element token inválido"

Os tokens expiram quando a UI muda. Execute `observe` novamente para obter tokens atualizados.

### "Falha na conexão"

Verifique se o launcher está rodando:
```bash
curl http://127.0.0.1:7777/ping
```

## Segurança

- ⚠️ **Sempre revise** a árvore de acessibilidade antes de clicar
- ⚠️ **Não execute** ações em janelas de sistema crítico
- ⚠️ **Use com cuidado** hotkeys que podem modificar dados (Ctrl+X, Delete, etc.)

## Limitações

- Funciona apenas no Windows
- Requer permissões de acessibilidade
- Alguns apps podem não expor elementos de acessibilidade completos
- Tokens de elemento expiram quando a UI muda

## Recursos Relacionados

- [Documentação do CUA SDK](https://github.com/QwenCode/cua-sdk)
- [Desktop Commander](./chat-integrado/desktop-commander-client.js) - Alternativa para automação
- [API Guide](../docs/api-keys-guide.md) - Configuração de APIs

---

**Autor:** Jean Carlos de Avila
**Versão:** 11.0.0
**Última atualização:** 2026-09-13
