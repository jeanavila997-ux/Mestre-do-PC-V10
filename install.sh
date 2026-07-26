#!/usr/bin/env bash
# ================================================================
# Mestre do PC V10 — Instalador para Linux / macOS
# ================================================================
# Instala dependências Node do MCP, verifica Ollama e registra o
# servidor MCP no Claude Code/Desktop.
#
# NOTA: os COMANDOS de manutenção (SFC, DISM, Defender, Get-PSDrive)
# são específicos do Windows. Em Linux/macOS o app funciona para:
#  - Servidor MCP (Node, multiplataforma)
#  - Chat IA via Ollama (multiplataforma)
#  - Dashboard /status (requer pwsh no Linux para métricas)
# O launcher PowerShell completo só roda em Windows.
#
# Uso:
#   chmod +x install.sh
#   ./install.sh
# ================================================================
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERRO]${NC} $1"; }
step()  { echo -e "\n${CYAN}=== $1 ===${NC}"; }

echo "=================================================="
echo "  Mestre do PC V10 — Instalador Linux/macOS"
echo "=================================================="

# ---------- 1. Node.js ----------
step "1/4 — Verificando Node.js"
if command -v node >/dev/null 2>&1; then
  ok "Node.js detectado: $(node -v)"
else
  err "Node.js não encontrado (requerido 18+)."
  echo "  Instale via:"
  echo "    Linux (Debian/Ubuntu):  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
  echo "    macOS (Homebrew):       brew install node"
  echo "    Ou baixe de:            https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  err "npm não encontrado. Reinstale o Node.js."
  exit 1
fi

# ---------- 2. Dependências do MCP ----------
step "2/4 — Instalando dependências do MCP"
MCP_DIR="$ROOT_DIR/mcp-server"
if [ -d "$MCP_DIR" ]; then
  cd "$MCP_DIR"
  npm install --no-audit --no-fund
  ok "Dependências do mcp-server instaladas."
  cd "$ROOT_DIR"
else
  warn "Pasta mcp-server/ não encontrada — pulando (instalação parcial)."
fi

# ---------- 3. Ollama ----------
step "3/4 — Verificando Ollama"
if command -v ollama >/dev/null 2>&1; then
  ok "Ollama detectado: $(ollama -v 2>&1 | head -1)"
else
  warn "Ollama não encontrado. Instalando via script oficial..."
  if curl -fsSL https://ollama.com/install.sh | sh; then
    ok "Ollama instalado."
  else
    err "Falha ao instalar Ollama. Instale manualmente:"
    echo "  curl -fsSL https://ollama.com/install.sh | sh"
    echo "  ou baixe em https://ollama.com/download"
  fi
fi

# Iniciar Ollama em background se não estiver rodando
if ! curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
  warn "Ollama não está rodando. Iniciando em background..."
  if command -v ollama >/dev/null 2>&1; then
    nohup ollama serve > /tmp/ollama-mestre.log 2>&1 &
    sleep 3
    if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
      ok "Ollama ativo em http://localhost:11434"
    else
      warn "Ollama pode precisar de alguns segundos. Verifique com: ollama serve"
    fi
  fi
else
  ok "Ollama já está ativo em http://localhost:11434"
fi

# Baixar modelo padrão (opcional)
if command -v ollama >/dev/null 2>&1; then
  if ! ollama list 2>/dev/null | grep -q "qwen2.5-coder"; then
    warn "Baixando modelo padrão qwen2.5-coder:1.5b (~1 GB)..."
    ollama pull qwen2.5-coder:1.5b && ok "Modelo baixado." || warn "Falha ao baixar modelo (faça manualmente: ollama pull qwen2.5-coder:1.5b)"
  else
    ok "Modelo qwen2.5-coder já presente."
  fi
fi

# ---------- 4. Registrar MCP no Claude Code ----------
step "4/4 — Registrando MCP no Claude Code (se disponível)"
if command -v claude >/dev/null 2>&1; then
  INDEX_JS="$MCP_DIR/index.js"
  claude mcp remove mestre_do_pc --scope user 2>/dev/null || true
  if claude mcp add mestre_do_pc --scope user --env "MESTRE_PROJETO_PATH=$ROOT_DIR" -- node "$INDEX_JS" 2>/dev/null; then
    ok "MCP 'mestre_do_pc' registrado no Claude Code."
  else
    warn "Não foi possível registrar o MCP via CLI. Configure manualmente."
  fi
else
  warn "Claude Code CLI não encontrado. Para configurar manualmente no Claude Desktop,"
  echo "  edite ~/.config/Claude/claude_desktop_config.json (Linux) ou"
  echo "  ~/Library/Application Support/Claude/claude_desktop_config.json (macOS):"
  echo '  { "mcpServers": { "mestre_do_pc": { "command": "node",'
  echo "  \"args\": [\"$INDEX_JS\"],"
  echo "  \"env\": { \"MESTRE_PROJETO_PATH\": \"$ROOT_DIR\" } } } }"
fi

# ---------- Resumo ----------
echo ""
echo "=================================================="
echo -e "${GREEN}  INSTALAÇÃO CONCLUÍDA${NC}"
echo "=================================================="
echo ""
echo "Para iniciar o launcher Node (multiplataforma, modo dev):"
echo "  cd v10 && node launcher.js      # porta 7777"
echo ""
echo "Para abrir a interface V10:"
echo "  abrir v10/index.html no navegador (com launcher ativo)"
echo ""
warn "NOTA: os comandos de manutenção do Windows (SFC, DISM, Defender)"
echo "  não funcionam em Linux/macOS. O app aqui serve para:"
echo "  - Chat IA via Ollama (multiplataforma)"
echo "  - Servidor MCP (Node)"
echo "  Para a experiência completa de manutenção, use Windows 10/11."
echo ""