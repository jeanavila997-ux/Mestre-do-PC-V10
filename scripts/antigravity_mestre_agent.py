#!/usr/bin/env python3
"""
antigravity_mestre_agent.py — Agente Google Antigravity SDK integrado ao Mestre do PC V10.

Fluxo (não quebra a arquitetura do projeto):

    agente Antigravity ──stdio──▶ mcp-server/index.js ──HTTP──▶ launcher 127.0.0.1:7777 ──▶ whitelist

O agente NUNCA executa PowerShell direto: `run_command`, `create_file` e
`edit_file` ficam negados por política. Toda ação administrativa passa pelo MCP
do Mestre do PC, que só aceita operações de `v10/allowed-operations.json`.

Segurança:
- Modo padrão: só operações de leitura (verificar_/listar_/ver_/... e não
  destrutivas) ficam visíveis e auto-aprovadas.
- `--permitir-escrita`: expõe o resto da whitelist, mas cada chamada pede
  confirmação no console (y/N). Operações `destructive: true` são destacadas.

Uso:
    python scripts/antigravity_mestre_agent.py --verificar-config
    python scripts/antigravity_mestre_agent.py -p "Como está a saúde do disco?"
    python scripts/antigravity_mestre_agent.py --ollama --modelo-ollama llama3.1
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

from google.antigravity import (
    Agent,
    LocalAgentConfig,
    LocalOpenAIAgentConfig,
    ToolContext,
    types,
)
from google.antigravity.hooks import policy

# Console do Windows em UTF-8 (acentos/emoji nas respostas).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

REPO_ROOT = Path(__file__).resolve().parent.parent
MCP_SERVER_JS = REPO_ROOT / "mcp-server" / "index.js"
WHITELIST_JSON = REPO_ROOT / "v10" / "allowed-operations.json"

# Regra dura do projeto: 127.0.0.1, nunca localhost.
MESTRE_BASE_URL = os.environ.get("MESTRE_BASE_URL", "http://127.0.0.1:7777").rstrip("/")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")

PREFIXOS_LEITURA = (
    "verificar_", "listar_", "ver_", "diagnosticar_", "obter_",
    "mostrar_", "exibir_", "consultar_", "status_",
)

MCP_SERVER_NAME = "mestre_pc"

# Comandos que alteram o sistema mesmo com prefixo de consulta → exigem confirmação.
MARCADORES_ALTERACAO = re.compile(
    r"(?i)sfc\s+/scannow|/restorehealth|chkdsk\b[^;]*\s/[fr]\b|winget\s+(upgrade\s+--all|install)"
)


# ==============================================================================
# Whitelist
# ==============================================================================

def carregar_whitelist() -> dict[str, dict]:
    """Lê `v10/allowed-operations.json` (operations + templates) indexado por id."""
    data = json.loads(WHITELIST_JSON.read_text(encoding="utf-8"))
    ops: dict[str, dict] = {}
    for chave in ("operations", "templates"):
        for op in data.get(chave, []):
            if op.get("enabled") is False or not op.get("id"):
                continue
            ops[op["id"]] = op
    return ops


def classificar_operacoes(ops: dict[str, dict]) -> tuple[list[str], list[str], set[str]]:
    """Separa ids em (leitura, escrita) e devolve o conjunto de destrutivas.

    Leitura = prefixo de consulta + `destructive: false` + comando sem marcador de
    reparo (ex.: `verificar_integridade_do_sistema_sfc_dism` roda `sfc /scannow`).
    """
    leitura, escrita, destrutivas = [], [], set()
    for op_id, op in ops.items():
        comando = op.get("command") or op.get("pattern") or ""
        if op.get("destructive"):
            destrutivas.add(op_id)
        if (not op.get("destructive")
                and op_id.startswith(PREFIXOS_LEITURA)
                and not MARCADORES_ALTERACAO.search(comando)):
            leitura.append(op_id)
        else:
            escrita.append(op_id)
    return sorted(leitura), sorted(escrita), destrutivas


# ==============================================================================
# Ferramentas Python (custom tools)
# ==============================================================================

def _http_ok(url: str, timeout: float = 2.0) -> tuple[bool, dict | str]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "MestreAntigravityAgent/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as res:
            corpo = res.read().decode("utf-8", errors="replace")
            try:
                return True, json.loads(corpo)
            except json.JSONDecodeError:
                return True, corpo
    except Exception as exc:  # noqa: BLE001 — diagnóstico, não propaga
        return False, str(exc)


def verificar_saude_launcher() -> str:
    """Verifica se o launcher do Mestre do PC (127.0.0.1:7777) está ativo.

    Use antes de chamar operações do MCP: sem o launcher, todas falham.
    """
    ok, info = _http_ok(f"{MESTRE_BASE_URL}/ping")
    if ok and isinstance(info, dict):
        return f"Launcher ativo. Versão {info.get('version', '?')}, PID {info.get('pid', '?')}."
    return (
        f"Launcher OFFLINE em {MESTRE_BASE_URL} ({info}). "
        "Peça ao usuário para rodar: pwsh mcp-server/start-launcher.ps1"
    )


def registrar_evento_sessao(categoria: str, detalhe: str, ctx: ToolContext) -> str:
    """Registra um achado de diagnóstico na memória desta sessão.

    Args:
        categoria: 'diagnostico', 'alerta' ou 'tarefa'.
        detalhe: Descrição curta do que foi observado ou executado.
        ctx: Contexto injetado pelo SDK (não preencha).
    """
    historico = ctx.get_state("historico_eventos", [])
    historico.append({"id": len(historico) + 1, "categoria": categoria, "detalhe": detalhe})
    ctx.set_state("historico_eventos", historico)
    return f"Evento #{len(historico)} registrado em [{categoria}]."


def resumo_sessao(ctx: ToolContext) -> str:
    """Devolve todos os eventos registrados nesta sessão, para o relatório final.

    Args:
        ctx: Contexto injetado pelo SDK (não preencha).
    """
    historico = ctx.get_state("historico_eventos", [])
    if not historico:
        return "Nenhum evento registrado."
    return "\n".join(f"#{e['id']} [{e['categoria']}] {e['detalhe']}" for e in historico)


# ==============================================================================
# Confirmação humana (ask_user)
# ==============================================================================

def criar_handler_confirmacao(destrutivas: set[str]):
    async def confirmar(tool_call: types.ToolCall) -> bool:
        nome = tool_call.name.split("/")[-1]
        alerta = "  ⚠️  DESTRUTIVA" if nome in destrutivas else ""
        print(f"\n[Confirmação] O agente quer executar: {nome}{alerta}")
        if tool_call.args:
            print(f"              argumentos: {json.dumps(tool_call.args, ensure_ascii=False)}")
        resposta = await asyncio.to_thread(input, "Permitir? [y/N] ")
        return resposta.strip().lower() in ("y", "s", "sim", "yes")

    return confirmar


# ==============================================================================
# Configuração do agente
# ==============================================================================

INSTRUCOES = """\
Você é o agente de diagnóstico do Mestre do PC V10 (Windows), construído com o Google Antigravity SDK.

Regras:
1. Ações no sistema só via tools do servidor MCP 'mestre_pc'. Nunca tente rodar shell direto.
2. Chame 'verificar_saude_launcher' primeiro. Se estiver offline, avise o usuário e pare.
3. Chame as tools do MCP UMA POR VEZ (o launcher aceita no máximo 3 jobs simultâneos).
4. Registre cada achado relevante com 'registrar_evento_sessao' e feche com 'resumo_sessao'.
5. Antes de propor operações que alteram o sistema, delegue ao subagente 'auditor_mestre'.
6. Responda em português do Brasil, de forma objetiva.
"""


def construir_config(args, leitura: list[str], escrita: list[str], destrutivas: set[str]):
    expostas = leitura + (escrita if args.permitir_escrita else [])

    env_mcp = {k: v for k, v in os.environ.items() if k not in ("GEMINI_API_KEY", "GOOGLE_API_KEY")}
    env_mcp["MESTRE_BASE_URL"] = MESTRE_BASE_URL

    mcp_server = types.McpStdioServer(
        name=MCP_SERVER_NAME,
        command="node",
        args=[str(MCP_SERVER_JS)],
        env=env_mcp,
        enabled_tools=expostas,  # só o necessário entra no contexto
        timeout_seconds=900,     # mesmo teto de job do launcher (15 min)
    )

    auditor = types.SubagentConfig(
        name="auditor_mestre",
        description=(
            "Audita se uma operação proposta é segura e está na whitelist do Mestre do PC. "
            "Lê v10/allowed-operations.json e responde APROVADO ou REPROVADO com o motivo."
        ),
        system_instructions=(
            "Você é auditor de segurança. Leia v10/allowed-operations.json, localize o id da "
            "operação, confira 'destructive' e 'command', e responda APROVADO/REPROVADO "
            "com justificativa curta em pt-BR. Você não executa nada."
        ),
        capabilities=types.SubagentCapabilities(
            agent_behavior=types.AgentBehavior.AUTONOMOUS,
            enabled_tools=[types.BuiltinTools.VIEW_FILE, types.BuiltinTools.SEARCH_DIR],
        ),
    )

    # Ordem de precedência do SDK: específico > prefixo do servidor > global.
    policies = [
        policy.deny("run_command"),
        policy.deny("create_file"),
        policy.deny("edit_file"),
        policy.allow(mcp_server, leitura),                                   # leitura: automático
        policy.ask_user(mcp_server, handler=criar_handler_confirmacao(destrutivas)),  # resto: y/N
        policy.allow_all(),  # tools Python, view_file (limitado ao workspace), subagente
    ]

    comum = dict(
        system_instructions=INSTRUCOES,
        tools=[verificar_saude_launcher, registrar_evento_sessao, resumo_sessao],
        mcp_servers=[mcp_server],
        subagents=[auditor],
        capabilities=types.CapabilitiesConfig(
            enable_subagents=True,
            max_subagent_depth=1,
            allowed_subagents=["auditor_mestre"],
        ),
        policies=policies,
        workspaces=[str(REPO_ROOT)],  # adiciona workspace_only para view_file
        budget_config=types.BudgetConfig(max_tool_calls=args.max_tools),
    )

    if args.ollama:
        return "ollama", LocalOpenAIAgentConfig(
            model=args.modelo_ollama,
            base_url=f"{OLLAMA_URL}/v1",
            **comum,
        )

    extra = {"model": args.modelo} if args.modelo else {}  # default do SDK quando omitido
    return "gemini", LocalAgentConfig(api_key=os.environ.get("GEMINI_API_KEY"), **extra, **comum)


# ==============================================================================
# Execução
# ==============================================================================

def checar_pre_requisitos(args) -> None:
    faltando = [p for p in (MCP_SERVER_JS, WHITELIST_JSON) if not p.exists()]
    if faltando:
        sys.exit(f"ERRO: arquivos ausentes: {', '.join(map(str, faltando))}")

    if args.ollama:
        ok, info = _http_ok(f"{OLLAMA_URL}/api/tags")
        if not ok:
            sys.exit(f"ERRO: Ollama offline em {OLLAMA_URL} ({info}). Rode `ollama serve`.")
    elif not os.environ.get("GEMINI_API_KEY"):
        sys.exit(
            "ERRO: GEMINI_API_KEY não definida.\n"
            "  Gere uma chave em https://aistudio.google.com/app/api-keys e rode:\n"
            "    $env:GEMINI_API_KEY = '<sua-chave>'\n"
            "  Ou use um modelo local:  --ollama"
        )


def verificar_config(args) -> None:
    """Monta a config sem abrir event loop nem chamar o modelo."""
    ops = carregar_whitelist()
    leitura, escrita, destrutivas = classificar_operacoes(ops)
    print(f"Whitelist: {len(ops)} operações | leitura: {len(leitura)} | "
          f"escrita: {len(escrita)} | destrutivas: {len(destrutivas)}")
    print(f"Expostas ao agente: {len(leitura) + (len(escrita) if args.permitir_escrita else 0)}")
    print(f"Launcher: {verificar_saude_launcher()}")
    backend, _ = construir_config(args, leitura, escrita, destrutivas)
    print(f"Config OK (backend: {backend}).")


async def executar(args) -> None:
    ops = carregar_whitelist()
    leitura, escrita, destrutivas = classificar_operacoes(ops)

    backend, config = construir_config(args, leitura, escrita, destrutivas)
    print(f"[*] Backend: {backend} | tools MCP expostas: "
          f"{len(leitura) + (len(escrita) if args.permitir_escrita else 0)}")
    print(f"[Prompt] {args.prompt}\n---")

    async with Agent(config) as agent:
        response = await agent.chat(args.prompt)
        async for chunk in response:
            print(chunk, end="", flush=True)
        print("\n---")


def main() -> None:
    p = argparse.ArgumentParser(description="Agente Antigravity SDK integrado ao Mestre do PC V10.")
    p.add_argument("-p", "--prompt",
                   default="Faça um diagnóstico rápido de saúde do PC e me dê um resumo.")
    p.add_argument("--ollama", action="store_true", help=f"Usa Ollama local ({OLLAMA_URL}).")
    p.add_argument("--modelo-ollama", default=os.environ.get("OLLAMA_MODEL", "llama3.1"))
    p.add_argument("--modelo", default=None,
                   help="Modelo Gemini explícito. Omitido = default do SDK.")
    p.add_argument("--permitir-escrita", action="store_true",
                   help="Expõe operações que alteram o sistema (cada uma pede confirmação y/N).")
    p.add_argument("--max-tools", type=int, default=30, help="Teto de chamadas de tool por sessão.")
    p.add_argument("--verificar-config", action="store_true",
                   help="Só monta a config e mostra estatísticas; não chama o modelo.")
    args = p.parse_args()
    if args.verificar_config:
        verificar_config(args)
        return
    checar_pre_requisitos(args)  # falha rápido antes de subir o event loop
    asyncio.run(executar(args))


if __name__ == "__main__":
    main()
