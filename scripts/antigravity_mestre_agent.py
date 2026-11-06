#!/usr/bin/env python3
"""
antigravity_mestre_agent.py — Agente Google Antigravity SDK integrado ao Mestre do PC V10.

Fluxo (não quebra a arquitetura do projeto):

    agente Antigravity ──stdio──▶ mcp-server/index.js ──HTTP──▶ launcher 127.0.0.1:7777 ──▶ whitelist

O agente NUNCA executa PowerShell direto: `run_command`, `create_file` e
`edit_file` ficam desabilitados e negados por política. Toda ação administrativa
passa pelo MCP do Mestre do PC, que só aceita operações de `v10/allowed-operations.json`.

Modos de execução (auto-detectados):
- Se `GEMINI_API_KEY` (ou `--api-key`) estiver definida e `--ollama` não for passado:
  usa `LocalAgentConfig` (Gemini na nuvem, modelo padrão do SDK).
- Caso contrário, usa automaticamente o Ollama local em `http://127.0.0.1:11434/v1`
  via `LocalOpenAIAgentConfig(...).lightweight()`, detectando os modelos instalados
  na máquina (priorizando `NEXO_MODEL` / `qwen3.5:4b`).

Uso rápido:
    python scripts/antigravity_mestre_agent.py
    python scripts/antigravity_mestre_agent.py -p "Como está o uso de RAM e processos ativos?"
    python scripts/antigravity_mestre_agent.py --interativo
    python scripts/antigravity_mestre_agent.py --verificar-config
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import subprocess
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
ENV_LOCAL_FILE = REPO_ROOT / ".env.local"


def carregar_env_local() -> None:
    """Carrega variáveis de `.env.local` sem sobrescrever o ambiente já definido."""
    if not ENV_LOCAL_FILE.exists():
        return
    try:
        for linha in ENV_LOCAL_FILE.read_text(encoding="utf-8").splitlines():
            texto = linha.strip()
            if not texto or texto.startswith("#") or "=" not in texto:
                continue
            chave, valor = texto.split("=", 1)
            chave = chave.strip()
            valor = valor.strip().strip("\"'")
            if chave and chave not in os.environ:
                os.environ[chave] = valor
    except OSError:
        pass


carregar_env_local()

# Regra dura do projeto: 127.0.0.1, nunca localhost.
MESTRE_BASE_URL = os.environ.get("MESTRE_BASE_URL", "http://127.0.0.1:7777").rstrip("/")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
if "localhost" in OLLAMA_URL:
    OLLAMA_URL = OLLAMA_URL.replace("localhost", "127.0.0.1")

PREFIXOS_LEITURA = (
    "verificar_", "listar_", "ver_", "diagnosticar_", "diagnostico_",
    "obter_", "mostrar_", "exibir_", "consultar_", "status_",
    "relatorio_", "info_", "testar_", "teste_",
)

# Atalhos essenciais de diagnóstico (mesma base de `BUILTIN_OPS` em v10/mobile/app.js)
# usados por padrão no modo Ollama local para caber rápido no contexto de modelos 4B/7B.
TOOLS_ESSENCIAIS_DIAGNOSTICO = (
    "relatorio_rapido_do_pc",
    "ver_uso_atual_de_ram",
    "listar_processos_por_uso_de_ram",
    "listar_processos_ativos",
    "ver_dns_atual",
    "verificar_status_do_windows_defender",
    "verificar_processos_node_ativos",
)

MCP_SERVER_NAME = "mestre_pc"

# Comandos que alteram o sistema mesmo com prefixo de consulta → exigem confirmação.
MARCADORES_ALTERACAO = re.compile(
    r"(?i)sfc\s+/scannow|/restorehealth|chkdsk\b[^;]*\s/[fr]\b|winget\s+(upgrade\s+--all|install)"
)


# ==============================================================================
# Descoberta de modelos Ollama e status de portas
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


def _porta_escutando_windows(porta: int) -> int | None:
    """Fallback sem abrir socket: consulta a tabela TCP do Windows pelo PID."""
    try:
        proc = subprocess.run(
            [
                "powershell", "-NoProfile", "-Command",
                f"$c = Get-NetTCPConnection -LocalPort {int(porta)} -State Listen "
                "-ErrorAction SilentlyContinue | Select-Object -First 1; "
                "if ($c) { $c.OwningProcess }",
            ],
            capture_output=True,
            text=True,
            timeout=4,
            check=False,
        )
        saida = proc.stdout.strip()
        return int(saida) if saida.isdigit() else None
    except Exception:  # noqa: BLE001
        return None


def listar_modelos_ollama_instalados() -> list[str]:
    """Obtém os modelos instalados no Ollama via HTTP `/api/tags` ou manifesto em disco."""
    ok, info = _http_ok(f"{OLLAMA_URL}/api/tags")
    if ok and isinstance(info, dict):
        nomes = [
            m.get("name") or m.get("model")
            for m in info.get("models", [])
            if m.get("name") or m.get("model")
        ]
        if nomes:
            return nomes

    manifest_dir = Path.home() / ".ollama" / "models" / "manifests" / "registry.ollama.ai" / "library"
    if not manifest_dir.exists():
        return []
    modelos: list[str] = []
    for arquivo in sorted(manifest_dir.rglob("*")):
        if arquivo.is_file():
            rel = arquivo.relative_to(manifest_dir).parts
            if len(rel) == 2:
                modelos.append(f"{rel[0]}:{rel[1]}")
    return modelos


def _garantir_qwen35_sem_clip(instalados: list[str]) -> list[str]:
    """Cria `qwen3.5:4b-text` (sem o projetor visual mmproj.gguf) se só `qwen3.5:4b` existir."""
    if "qwen3.5:4b-text" in instalados or "qwen3.5:4b" not in instalados:
        return instalados
    manifest = (
        Path.home() / ".ollama" / "models" / "manifests"
        / "registry.ollama.ai" / "library" / "qwen3.5" / "4b"
    )
    if not manifest.exists():
        return instalados
    try:
        dados = json.loads(manifest.read_text(encoding="utf-8"))
        digest = next(
            (camada.get("digest", "") for camada in dados.get("layers", [])
             if camada.get("mediaType") == "application/vnd.ollama.image.model"),
            "",
        )
        if not digest.startswith("sha256:"):
            return instalados
        blob = Path.home() / ".ollama" / "models" / "blobs" / digest.replace(":", "-")
        if not blob.exists():
            return instalados
        import tempfile
        modelfile_conteudo = (
            f"FROM {blob}\n"
            "TEMPLATE {{ .Prompt }}\n"
            "RENDERER qwen3.5\n"
            "PARSER qwen3.5\n"
            "PARAMETER num_ctx 8192\n"
            "PARAMETER presence_penalty 1.5\n"
            "PARAMETER temperature 0.3\n"
            "PARAMETER top_k 20\n"
            "PARAMETER top_p 0.95\n"
        )
        with tempfile.NamedTemporaryFile("w", suffix=".Modelfile", delete=False, encoding="utf-8") as tmp:
            tmp.write(modelfile_conteudo)
            tmp_path = Path(tmp.name)
        try:
            res = subprocess.run(
                ["ollama", "create", "qwen3.5:4b-text", "-f", str(tmp_path)],
                capture_output=True, text=True, timeout=30, check=False,
            )
            if res.returncode == 0:
                return ["qwen3.5:4b-text", *instalados]
        finally:
            tmp_path.unlink(missing_ok=True)
    except Exception:  # noqa: BLE001
        pass
    return instalados


def escolher_modelo_ollama(explicito: str | None) -> str:
    """Seleciona o modelo Ollama mais adequado disponível na máquina."""
    if explicito:
        return explicito
    instalados = _garantir_qwen35_sem_clip(listar_modelos_ollama_instalados())
    # qwen3.5:4b-text usa o mesmo blob GGUF de qwen3.5:4b, mas sem o projetor CLIP
    # (mmproj.gguf) que estoura VRAM / falha no llama-server em GPUs com <4 GB livres.
    preferidos = [
        "qwen3.5:4b-text",
        os.environ.get("NEXO_MODEL"),
        os.environ.get("OLLAMA_MODEL"),
        "qwen3.5:4b",
        "qwen2.5-coder:3b-instruct",
        "deepseek-coder:6.7b",
    ]
    for candidato in preferidos:
        if candidato and candidato in instalados:
            return candidato
    if instalados:
        return instalados[0]
    return "qwen3.5:4b-text"


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

def verificar_saude_launcher() -> str:
    """Verifica se o launcher do Mestre do PC (127.0.0.1:7777) está ativo.

    Use antes de chamar operações do MCP: sem o launcher, todas falham.
    """
    ok, info = _http_ok(f"{MESTRE_BASE_URL}/ping")
    if ok and isinstance(info, dict):
        return f"Launcher ativo. Versão {info.get('version', '?')}, PID {info.get('pid', '?')}."
    pid = _porta_escutando_windows(7777)
    if pid:
        return f"Launcher LISTENING na porta 7777 (PID {pid}) [sondagem HTTP bloqueada: {info}]."
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


def resolver_backend(args) -> tuple[str, str | None, str]:
    """Decide entre ('gemini', api_key, modelo) ou ('ollama', None, modelo_ollama)."""
    chave_gemini = getattr(args, "api_key", None) or os.environ.get("GEMINI_API_KEY")
    usar_ollama = bool(getattr(args, "ollama", False)) or not chave_gemini
    if usar_ollama:
        modelo_ollama = escolher_modelo_ollama(getattr(args, "modelo_ollama", None))
        return "ollama", None, modelo_ollama
    return "gemini", chave_gemini, getattr(args, "modelo", None) or "(default do SDK)"


def construir_config(args, leitura: list[str], escrita: list[str], destrutivas: set[str]):
    backend, chave_gemini, modelo_escolhido = resolver_backend(args)

    # No modo Ollama local, expomos por padrão o conjunto essencial de diagnóstico
    # (~15 tools) para caber com folga na janela de contexto de modelos 4B/7B.
    # Com --todas-leituras (ou no Gemini), todas as ~100 tools de leitura ficam visíveis.
    todas_leituras = bool(getattr(args, "todas_leituras", False)) or backend == "gemini"
    if todas_leituras:
        leitura_ativa = leitura
    else:
        essenciais = [op_id for op_id in TOOLS_ESSENCIAIS_DIAGNOSTICO if op_id in leitura]
        leitura_ativa = essenciais or leitura[:20]

    expostas = leitura_ativa + (escrita if args.permitir_escrita else [])

    env_mcp = {k: v for k, v in os.environ.items() if k not in ("GEMINI_API_KEY", "GOOGLE_API_KEY")}
    env_mcp["MESTRE_BASE_URL"] = MESTRE_BASE_URL

    mcp_server = types.McpStdioServer(
        name=MCP_SERVER_NAME,
        command="node",
        args=[str(MCP_SERVER_JS)],
        env=env_mcp,
        enabled_tools=expostas,        # só o necessário entra no contexto
        force_all_tools_eager=True,    # expõe as tools diretamente ao modelo (sem lazy lookup)
        timeout_seconds=900,           # mesmo teto de job do launcher (15 min)
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
        policy.allow(mcp_server, leitura_ativa),                             # leitura: automático
        policy.ask_user(mcp_server, handler=criar_handler_confirmacao(destrutivas)),  # resto: y/N
        policy.allow_all(),  # tools Python, view_file (limitado ao workspace), subagente
    ]

    capabilities = types.CapabilitiesConfig(
        enable_subagents=True,
        max_subagent_depth=1,
        allowed_subagents=["auditor_mestre"],
        enabled_tools=[
            types.BuiltinTools.VIEW_FILE,
            types.BuiltinTools.SEARCH_DIR,
            types.BuiltinTools.INVOKE_SUBAGENT,
        ],
    )

    comum = dict(
        system_instructions=INSTRUCOES,
        tools=[verificar_saude_launcher, registrar_evento_sessao, resumo_sessao],
        mcp_servers=[mcp_server],
        subagents=[auditor],
        capabilities=capabilities,
        policies=policies,
        workspaces=[str(REPO_ROOT)],  # adiciona workspace_only para view_file
        budget_config=types.BudgetConfig(max_tool_calls=args.max_tools),
    )

    if backend == "ollama":
        cfg = LocalOpenAIAgentConfig(
            model=modelo_escolhido,
            base_url=f"{OLLAMA_URL}/v1",
            **comum,
        ).lightweight()
        return f"ollama ({modelo_escolhido})", cfg

    extra = {"model": args.modelo} if getattr(args, "modelo", None) else {}
    cfg = LocalAgentConfig(api_key=chave_gemini, **extra, **comum)
    return f"gemini ({modelo_escolhido})", cfg


# ==============================================================================
# Execução
# ==============================================================================

def checar_pre_requisitos(args) -> None:
    faltando = [p for p in (MCP_SERVER_JS, WHITELIST_JSON) if not p.exists()]
    if faltando:
        sys.exit(f"ERRO: arquivos ausentes: {', '.join(map(str, faltando))}")

    backend, _, modelo_escolhido = resolver_backend(args)
    if backend == "ollama":
        ok, info = _http_ok(f"{OLLAMA_URL}/api/tags")
        pid_ollama = _porta_escutando_windows(11434) if not ok else None
        if not ok and not pid_ollama:
            sys.exit(f"ERRO: Ollama offline em {OLLAMA_URL} ({info}). Rode `ollama serve`.")
        instalados = listar_modelos_ollama_instalados()
        if instalados and modelo_escolhido not in instalados:
            sys.exit(
                f"ERRO: Modelo Ollama '{modelo_escolhido}' não está instalado.\n"
                f"  Modelos instalados na máquina: {', '.join(instalados)}\n"
                f"  Use: --modelo-ollama {instalados[0]}"
            )


def verificar_config(args) -> None:
    """Monta a config sem abrir event loop nem chamar o modelo."""
    ops = carregar_whitelist()
    leitura, escrita, destrutivas = classificar_operacoes(ops)
    instalados = listar_modelos_ollama_instalados()
    backend_label, cfg = construir_config(args, leitura, escrita, destrutivas)
    expostas = len(cfg.mcp_servers[0].enabled_tools or [])
    print(f"Whitelist: {len(ops)} operações | leitura: {len(leitura)} | "
          f"escrita: {len(escrita)} | destrutivas: {len(destrutivas)}")
    print(f"Modelos Ollama instalados: {', '.join(instalados) if instalados else '(nenhum detectado)'}")
    print(f"Tools MCP expostas ao agente: {expostas}")
    print(f"Launcher: {verificar_saude_launcher()}")
    print(f"Config OK -> backend: {backend_label}")


async def executar(args) -> None:
    ops = carregar_whitelist()
    leitura, escrita, destrutivas = classificar_operacoes(ops)
    backend_label, config = construir_config(args, leitura, escrita, destrutivas)
    expostas = len(config.mcp_servers[0].enabled_tools or [])

    print(f"[*] Backend: {backend_label} | tools MCP expostas: {expostas}")

    async with Agent(config) as agent:
        if args.interativo:
            print("[Modo interativo] Digite sua pergunta ou 'sair' para encerrar.\n")
            while True:
                try:
                    pergunta = (await asyncio.to_thread(input, "Você > ")).strip()
                except (EOFError, KeyboardInterrupt):
                    print()
                    break
                if not pergunta or pergunta.lower() in ("sair", "exit", "quit"):
                    break
                resposta = await agent.chat(pergunta)
                print("Agente > ", end="", flush=True)
                async for chunk in resposta:
                    print(chunk, end="", flush=True)
                print("\n")
        else:
            print(f"[Prompt] {args.prompt}\n---")
            response = await agent.chat(args.prompt)
            async for chunk in response:
                print(chunk, end="", flush=True)
            print("\n---")


def main() -> None:
    p = argparse.ArgumentParser(description="Agente Antigravity SDK integrado ao Mestre do PC V10.")
    p.add_argument("-p", "--prompt",
                   default="Verifique a saúde do launcher e faça um resumo rápido do uso de RAM.")
    p.add_argument("-i", "--interativo", action="store_true",
                   help="Inicia chat interativo no terminal.")
    p.add_argument("--api-key", default=None,
                   help="Chave Gemini (ou defina GEMINI_API_KEY). Sem chave, usa Ollama local.")
    p.add_argument("--ollama", action="store_true",
                   help=f"Força uso do Ollama local ({OLLAMA_URL}).")
    p.add_argument("--modelo-ollama", default=None,
                   help="Modelo Ollama (auto-detecta qwen3.5:4b / instalados se omitido).")
    p.add_argument("--modelo", default=None,
                   help="Modelo Gemini explícito. Omitido = default do SDK.")
    p.add_argument("--todas-leituras", action="store_true",
                   help="No Ollama, expõe todas as ~100 operações de leitura (padrão: ~15 essenciais).")
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
