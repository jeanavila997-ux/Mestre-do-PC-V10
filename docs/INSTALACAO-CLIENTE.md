# Guia de Instalação e Ativação — Mestre do PC V10

> Checklist completo do que um cliente precisa para baixar, instalar
> dependências, ativar o servidor, o MCP, o Ollama e abrir o app.

---

## 1. Pré-requisitos (o que o cliente precisa inicialmente)

| Dependência | Obrigatória? | Versão mínima | Como instalar |
|---|---|---|---|
| **Windows 10/11** | ✅ Sim | 10 22H2+ | — (o app é para Windows) |
| **Node.js** | ✅ Sim | 18+ (recomendado 20 LTS+) | https://nodejs.org ou `winget install OpenJS.NodeJS.LTS` |
| **PowerShell** | ✅ Sim (já vem no Windows) | 5.1 (nativo) — recomendado 7+ | `winget install Microsoft.PowerShell` |
| **Ollama** | ✅ Sim (para a IA Local) | 0.32+ | ver seção 5 |
| **winget** | ⚠️ Recomendado | 1.x | já vem no Windows 11 / App Installer |
| **Git** | ⚠️ Recomendado (para clonar) | 2.x | `winget install Git.Git` |
| **Python** | ❌ **NÃO é necessário** | — | o app não usa Python (só Node + PowerShell + HTML) |
| **Claude Desktop** | ⚠️ Só se quiser MCP | — | https://claude.ai/download |

> 💡 **Nota sobre Python:** o Mestre do PC V10 **não usa Python** em nenhuma parte.
> É 100% Node.js + PowerShell + HTML/JavaScript. Python só seria necessário se
> o cliente quisesse usar a biblioteca `ollama-python` separadamente.

---

## 2. Instalação do Ollama (Linux, Windows, macOS)

### 🪟 Windows
```powershell
# Método 1 (recomendado — installer oficial)
irm https://ollama.com/install.ps1 | iex
# Ou baixe o instalador gráfico: https://ollama.com/download/OllamaSetup.exe
```
- Roda como app nativo em background, sem precisar de admin.
- API em `http://localhost:11434`.
- Requer Windows 10 22H2+. Suporta NVIDIA e AMD Radeon.

### 🐧 Linux
```bash
# Método 1 (instalador automático)
curl -fsSL https://ollama.com/install.sh | sh

# Método 2 (manual, amd64)
curl -fsSL https://ollama.com/download/ollama-linux-amd64.tar.zst | sudo tar x -C /usr

# Iniciar
ollama serve
# Em outro terminal, verificar
ollama -v
```
**Como serviço (recomendado):**
```bash
sudo useradd -r -s /bin/false -U -m -d /usr/share/ollama ollama
sudo usermod -a -G ollama $(whoami)
# criar /etc/systemd/system/ollama.service (ExecStart=/usr/bin/ollama serve, User=ollama)
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl start ollama
```
- AMD GPU: baixar também `ollama-linux-amd64-rocm.tar.zst`.
- ARM64: usar `ollama-linux-arm64.tar.zst`.

### 🍎 macOS
```shell
curl -fsSL https://ollama.com/install.sh | sh
# Ou baixe o .dmg: https://ollama.com/download/Ollama.dmg
```
- Suporta Apple Silicon (M1/M2/M3) nativamente.

### Baixar um modelo (todas as plataformas)
```bash
ollama pull qwen2.5-coder:1.5b     # modelo local leve (~1 GB) — PADRÃO do V10, funciona sem login
ollama run qwen2.5-coder:1.5b      # testar
```

### Ativar modelos cloud (opcional — exige conta Ollama)
A V10 também detecta modelos cloud (`glm-5.2:cloud`, `gemma4:cloud`, `kimi-k2.5:cloud`, `minimax-m3:cloud`). Para usá-los:
```bash
ollama signin      # abre o navegador para login em ollama.com
```
> Sem `ollama signin`, os modelos cloud falham. O V10 usa `qwen2.5-coder:1.5b` (local) como padrão justamente para funcionar sem login.

### Desativar cloud (modo 100% local/privado)
```bash
# Variável de ambiente
export OLLAMA_NO_CLOUD=1           # Linux/macOS
setx OLLAMA_NO_CLOUD 1             # Windows
# Ou em ~/.ollama/server.json: { "disable_ollama_cloud": true }
```

---

## 3. Baixar o app e instalar dependências

### Passo 1 — Clonar o repositório
```powershell
git clone https://github.com/jeanavila997-ux/Mestre-do-PC-V7.git MestreDoPC_V7_clone
cd MestreDoPC_V7_clone
```
> Ou baixe o ZIP em https://github.com/jeanavila997-ux/Mestre-do-PC-V7 e extraia.

### Passo 2 — Instalação automatizada (tudo num comando)
```powershell
# Execute como Administrador (eleva sozinho via UAC)
.\INSTALAR.bat
```
O `INSTALAR.bat` chama `install.ps1`, que faz:
1. Verifica Node.js (instala via `winget` se faltar)
2. `npm install` no `mcp-server/`
3. Registra a **tarefa agendada** `MestreDoPC_Admin_Launcher` (launcher admin, AtLogon)
4. Registra o MCP no Claude Desktop/Code (`claude_desktop_config.json`)
5. Cria atalhos na Área de Trabalho e Menu Iniciar
6. Health-check do launcher em `http://127.0.0.1:7777/ping`

### Passo 3 — Instalação manual (passo a passo, se preferir)
```powershell
# 1. Dependências do MCP
cd mcp-server
npm install
cd ..

# 2. Registrar a tarefa agendada do launcher (UMA VEZ, como Admin)
powershell -ExecutionPolicy Bypass -File .\Register-MestreTask.ps1 -InstallDir $PWD.Path

# 3. Subir o launcher (dispara a tarefa — sem UAC depois de registrada)
schtasks /Run /TN "MestreDoPC_Admin_Launcher"

# 4. Verificar
curl http://127.0.0.1:7777/ping
```

---

## 4. Ativar o servidor (Launcher PowerShell)

O **launcher** é o backend admin que executa os comandos PowerShell do app.
Roda em `http://127.0.0.1:7777` como **Administrador** (necessário para
SFC, DISM, Defender, etc.).

### Método A — Tarefa agendada (recomendado, auto-start no login)
```powershell
# Registrar (uma vez, como Admin)
powershell -ExecutionPolicy Bypass -File .\Register-MestreTask.ps1 -InstallDir $PWD.Path

# Disparar manualmente (não exige admin depois de registrado)
schtasks /Run /TN "MestreDoPC_Admin_Launcher"

# Status
schtasks /Query /TN "MestreDoPC_Admin_Launcher" /FO LIST
```

### Método B — Manual (como Administrador)
```powershell
# Abrir um PowerShell como Admin e rodar:
powershell -ExecutionPolicy Bypass -File .\MestreDoPC-Launcher.ps1
```

### Método C — start-mestre.bat (compatibilidade)
```cmd
start-mestre.bat
```
> Encaminha para `v10\start-v10.bat`.

### Endpoints do launcher (porta 7777)
| Endpoint | Função |
|---|---|
| `GET /ping` | Health-check + estado + jobs ativos |
| `GET /status` | Métricas do sistema (CPU/RAM/disco/uptime) p/ dashboard |
| `POST /run` | Agenda comando PowerShell → `{jobId}` |
| `GET /run-status?id=` | Estado/output do job (polling) |
| `POST /open-terminal` | Abre PowerShell admin |
| `GET /mcp-status` | Status do MCP server |
| `GET /ollama/tags` | Proxy Ollama (lista modelos) |
| `POST /ollama/chat` | Proxy Ollama chat com **streaming** |

Os endpoints `POST` exigem o cabeçalho local `X-Mestre-Client` e recusam origens
externas. Não exponha a porta 7777 na rede.

---

## 5. Ativar o MCP (Claude Desktop / Claude Code)

### Registrar no Claude Desktop
O `install.ps1` faz automaticamente. Manualmente, edite
`%APPDATA%\Claude\claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "mestre_do_pc": {
      "command": "node",
      "args": ["C:\\MestreDoPC_V7_clone\\mcp-server\\index.js"],
      "env": { "MESTRE_PROJETO_PATH": "C:\\MestreDoPC_V7_clone" }
    }
  }
}
```
Reinicie o Claude Desktop. Um ícone de "Ferramentas" confirmará a conexão.

### Registrar no Claude Code (CLI)
```powershell
claude mcp add mestre_do_pc --scope user --env "MESTRE_PROJETO_PATH=$PWD" -- node "$PWD\mcp-server\index.js"
```

### Testar o MCP manualmente
```powershell
cd mcp-server
npm start    # node index.js  (stdio, normalmente o Claude inicia)
```

---

## 6. Abrir o app (ativação final)

### Método 1 — Atalho da Área de Trabalho (mais fácil)
- **"Mestre do PC"** → abre a V10 (`v10\start-v10.bat`)

### Método 2 — start-v10.bat (sem UAC)
```cmd
v10\start-v10.bat
```
Faz: health-check em `/ping` → se offline, dispara a tarefa agendada → abre
`http://127.0.0.1:7777/`.

### Método 3 — Abrir a URL local
```cmd
start http://127.0.0.1:7777/
```

---

## 7. Checklist resumido para o cliente

```
☐ 1. Instalar Node.js 18+        → winget install OpenJS.NodeJS.LTS
☐ 2. Instalar Ollama             → irm https://ollama.com/install.ps1 | iex
☐ 3. Baixar modelo IA            → ollama pull qwen2.5-coder:1.5b
☐ 4. Clonar o repo               → git clone https://github.com/jeanavila997-ux/Mestre-do-PC-V7.git
☐ 5. Rodar instalador (Admin)    → .\INSTALAR.bat
   ↳ instala deps MCP
   ↳ registra tarefa agendada do launcher
   ↳ registra MCP no Claude
   ↳ cria atalhos
☐ 6. Abrir o app                 → clicar no atalho "Mestre do PC" (V10)
☐ 7. (Opcional) Configurar Claude → reiniciar Claude Desktop p/ ativar MCP
```

---

## 8. Configuração avançada do Ollama (variáveis de ambiente)

| Variável | Padrão | Função |
|---|---|---|
| `OLLAMA_ORIGINS` | configuração do Ollama | Origens CORS permitidas. A V10 usa o proxy local; não configure `*` |
| `OLLAMA_HOST` | `127.0.0.1:11434` | Bind address. Para expor na rede: `0.0.0.0:11434` |
| `OLLAMA_MODELS` | `~/.ollama/models` | Local dos modelos. Mude se pouco espaço no C: → `setx OLLAMA_MODELS "D:\ollama-models"` |
| `OLLAMA_KEEP_ALIVE` | `5m` | Tempo que o modelo fica em memória. `-1` = sempre carregado (resposta +rápida) |
| `OLLAMA_CONTEXT_LENGTH` | `4096` | Tamanho do contexto (tokens) |
| `OLLAMA_NO_CLOUD` | (off) | `1` desativa modelos cloud (modo 100% local/privado) |
| `HTTPS_PROXY` | — | Proxy corporativo para baixar modelos. NÃO use `HTTP_PROXY` |
| `OLLAMA_FLASH_ATTENTION` | auto | `1` força Flash Attention (menos RAM) |
| `OLLAMA_KV_CACHE_TYPE` | `f16` | `q8_0` = metade da RAM com perda mínima |
| `OLLAMA_NUM_PARALLEL` | `1` | Requisições paralelas por modelo |
| `OLLAMA_MAX_LOADED_MODELS` | 3×GPUs | Máximo de modelos simultâneos em memória |

**No Windows:** `setx VAR "valor"` (persiste após reboot). Depois reinicie o Ollama.
**No Linux (systemd):** `sudo systemctl edit ollama` → `Environment="VAR=valor"` → `systemctl daemon-reload && systemctl restart ollama`.
**No macOS (app):** `launchctl setenv VAR "valor"` + reiniciar Ollama.

### Verificar GPU / modelo carregado
```bash
ollama ps      # PROCESSOR: 100% GPU / 100% CPU / misto
```

### Pré-carregar modelo (resposta instantânea no primeiro chat)
```bash
curl http://localhost:11434/api/chat -d '{"model":"qwen2.5-coder:1.5b","keep_alive":"10m"}'
```

## 9. Solução de problemas

| Sintoma | Causa | Solução |
|---|---|---|
| "Launcher offline" no app | Tarefa agendada não registrada | `schtasks /Run /TN "MestreDoPC_Admin_Launcher"` ou rode `Register-MestreTask.ps1` como admin |
| "Ollama offline" no IA Local | Ollama não rodando | `ollama serve` ou abra o app Ollama |
| Comando não executa | Launcher sem admin | registrar a tarefa agendada (roda em contexto elevado) |
| IA não responde | Sem modelos | `ollama pull qwen2.5-coder:1.5b` |
| Modelo cloud falha | Não fez login | `ollama signin` (ou use o modelo local padrão) |
| `npm install` falha | Node ausente/desatualizado | instale Node 18+ via nodejs.org |
| App aberto por `file://` não executa | proteção de origem ativa | abra pelo atalho ou por `http://127.0.0.1:7777/` |
| Pouco espaço p/ modelos | — | `setx OLLAMA_MODELS "D:\ollama-models"` + reiniciar Ollama |

---

## 10. Versões testadas na máquina de desenvolvimento

```
Node:        v24.18.0
npm:         11.16.0
PowerShell:  5.1.29617.1000 (nativo) + 7.6.4 (pwsh)
Python:      3.14.6 (NÃO usado pelo app)
Ollama:      0.32.4
winget:      v1.29.280
git:         2.55.0
```

> **Conclusão:** o cliente precisa de **Node.js** e **Ollama** (e Windows).
> PowerShell já vem no Windows. Python **não é necessário**.
> O `INSTALAR.bat` cuida de tudo o resto (deps MCP, tarefa agendada,
> atalhos, registro MCP no Claude).
