# 🖱️ Computer Use - Instalação Rápida

## Passo 1: Instalar o SDK

Abra o PowerShell como Administrador e execute:

```powershell
cd "C:\Users\JEANPC\MESTRE DO PC\Mestre-do-PC-V10"
npm install @qwen-code/cua-sdk@0.20.4
```

Ou use o script automático:

```powershell
node scripts/install-computer-use.js
```

## Passo 2: Verificar Instalação

```powershell
npm list @qwen-code/cua-sdk
```

Deve aparecer:
```
mestre-do-pc-v10@10.0.0
└── @qwen-code/cua-sdk@0.20.4
```

## Passo 3: Iniciar o Launcher

```powershell
# Método 1: Via npm
npm start

# Método 2: Via atalho
# Use o atalho "Mestre do PC" na área de trabalho
```

## Passo 4: Acessar a UI

1. Abra o navegador
2. Acesse: `http://127.0.0.1:7777`
3. Navegue até a categoria **"🖱️ Computer Use"** (no final do menu)

## Passo 5: Testar Funcionalidades

### Teste 1: Listar Aplicativos

1. Clique em **"📋 Listar Aplicativos"**
2. Verifique se aparecem apps como:
   - explorer.exe
   - chrome.exe
   - notepad.exe

### Teste 2: Observar Janela

1. Abra o **Bloco de Notas**
2. No Computer Use, clique em **"👁️ Observar Janela (Árvore UX)"**
3. Informe o **PID** do Notepad (veja em "Listar Aplicativos")
4. Deixe **Window ID** em branco (usa janela principal)
5. Clique em **OK**

Você verá:
- 📊 **Barra lateral**: Resumo dos elementos (botões, inputs, menus)
- 📋 **Lista completa**: Todos os elementos com ações

### Teste 3: Interagir com Elemento

1. Na árvore de elementos, localize um botão ou input
2. Clique em **🖱️ Click** ou **⌨️ Type**
3. O Computer Use executará a ação!

## Comandos Disponíveis

| Ícone | Comando | Descrição |
|-------|---------|-----------|
| 📋 | Listar Aplicativos | Mostra apps em execução com PID |
| 🪟 | Listar Janelas | Mostra janelas de um app específico |
| 👁️ | Observar Janela | Árvore de acessibilidade interativa |
| 🖱️ | Clicar | Clica em elemento ou coordenada |
| ⌨️ | Digitar Texto | Digita texto em elemento |
| 🔘 | Pressionar Tecla | Pressiona tecla (Enter, Tab, etc.) |
| 📜 | Scroll | Rola para cima/baixo/esquerda/direita |
| 📝 | Definir Valor | Define valor em input/textarea |
| 🎯 | Ação Secundária | Menu, expandir, colapsar, etc. |
| ⚡ | Hotkey | Combinação de teclas (Ctrl+C, etc.) |
| 🔒 | Fechar | Encerra sessão do Computer Use |
| 📊 | Status | Mostra estado da conexão |

## Troubleshooting

### ❌ "Módulo não encontrado"

```powershell
# Reinstale o SDK
npm install @qwen-code/cua-sdk@0.20.4 --force
```

### ❌ "Launcher offline"

1. Execute o launcher como **Administrador**
2. Verifique a porta 7777:
   ```powershell
   netstat -ano | findstr :7777
   ```

### ❌ "PID não encontrado"

1. Liste os aplicativos primeiro
2. Verifique se o app está realmente em execução
3. Some apps podem não expor elementos de acessibilidade

### ❌ "Element token expirado"

A UI mudou desde a última observação. Execute **Observar Janela** novamente.

## Dicas de Uso

### 💡 Fluxo Ideal

1. **Listar Apps** → Descobrir PID
2. **Listar Janelas** → Identificar Window ID (opcional)
3. **Observar Janela** → Ver elementos
4. **Clicar/Digitar** → Executar ação
5. **Observar novamente** → Verificar mudança

### 💡 Atalhos Úteis

- **Ctrl+Shift+I**: Inspecionar elementos (dev tools)
- **F5**: Recarregar UI (não afeta Computer Use)
- **Esc**: Fechar modais

### 💡 Apps com Melhor Suporte

- ✅ Bloco de Notas
- ✅ WordPad
- ✅ Explorador de Arquivos
- ✅ Navegadores (Chrome, Edge, Firefox)
- ✅ VS Code
- ✅ Terminal/PowerShell

### ⚠️ Apps com Suporte Limitado

- ❌ Apps UWP (loja Microsoft)
- ❌ Jogos
- ❌ Apps com UI customizada (Electron às vezes)

## Segurança

- ⚠️ **Nunca** use em janelas de sistema crítico
- ⚠️ **Sempre revise** a árvore antes de clicar
- ⚠️ **Cuidado** com hotkeys destrutivas (Ctrl+X, Delete)

## Próximos Passos

1. 📖 Leia a documentação completa: `docs/computer-use.md`
2. 🧪 Teste diferentes aplicativos
3. 🤖 Integre com automações do Mestre do PC
4. 💬 Reporte bugs ou sugestões

---

**Suporte:** Jean Carlos de Avila
**Versão:** 11.0.0
**Data:** 2026-09-13
