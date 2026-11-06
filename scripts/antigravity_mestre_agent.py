#!/usr/bin/env python3
"""
antigravity_mestre_agent.py — Agente Google Antigravity SDK integrado ao Mestre do PC V10.

Demonstra:
1. Ferramentas nativas em Python (com e sem estado via ToolContext).
2. Conexão com o servidor MCP oficial do Mestre do PC (mcp-server/index.js) via Stdio.
3. Sistema Multi-Agente com Subagente especializado em auditoria e validação de segurança.
4. Suporte flexível a modelos (Gemini via nuvem ou Ollama local em 127.0.0.1).
"""

import argparse
import asyncio
import os
import sys
import urllib.request
import json
from pathlib import Path

from google.antigravity import (
    Agent,
    LocalAgentConfig,
    LocalOpenAIAgentConfig,
    ToolContext,
    types,
)
from google.antigravity.hooks import policy

# Determina raiz do repositório
REPO_ROOT = Path(__file__).resolve().parent.parent
MCP_SERVER_JS = REPO_ROOT / "mcp-server" / "index.js"
LAUNCHER_PING_URL = "http://127.0.0.1:7777/ping"


# ==============================================================================
# 1. Ferramentas Customizadas (Python)
# ==============================================================================

def verificar_saude_launcher() -> str:
    """Verifica se o launcher local do Mestre do PC (porta 7777) está ativo.

    Retorna status de conexão e versão do launcher.
    """
    try:
        req = urllib.request.Request(
            LAUNCHER_PING_URL,
            headers={"User-Agent": "AntigravityAgent/1.0"}
        )
        with urllib.request.urlopen(req, timeout=2.0) as res:
            if res.status == 200:
                data = json.loads(res.read().decode("utf-8"))
                return (
                    f"✅ Launcher ativo em 127.0.0.1:7777. "
                    f"Versão: {data.get('version', 'desconhecida')}, PID: {data.get('pid', 'N/A')}."
                )
    except Exception as e:
        return (
            f"⚠️ Launcher offline em 127.0.0.1:7777 ({str(e)}). "
            f"Para iniciar, execute em outro terminal: pwsh mcp-server/start-launcher.ps1"
        )


def registrar_evento_sessao(categoria: str, detalhe: str, ctx: ToolContext) -> str:
    """Registra uma ocorrência ou diagnóstico na memória da sessão atual.

    Args:
        categoria: Categoria da ocorrência (ex: 'diagnostico', 'alerta', 'tarefa').
        detalhe: Descrição detalhada do que foi observado ou executado.
        ctx: Contexto injetado pelo SDK para gerenciar estado compartilhado.
    """
    historico = ctx.get_state("historico_eventos", [])
    evento = {
        "id": len(historico) + 1,
        "categoria": categoria,
        "detalhe": detalhe,
    }
    historico.append(evento)
    ctx.set_state("historico_eventos", historico)
    return f"Ocorrência #{evento['id']} registrada na categoria [{categoria}]. Total acumulado: {len(historico)}."


# ==============================================================================
# 2. Configuração Multi-Agente (Subagentes)
# ==============================================================================

def criar_subagente_auditor() -> types.SubagentConfig:
    """Configura o subagente especializado em auditoria e checagem de conformidade."""
    return types.SubagentConfig(
        name="auditor_mestre",
        description=(
            "Especialista em auditoria de integridade do Windows e conformidade de regras. "
            "Use este agente para auditar se comandos e operações solicitadas estão "
            "de acordo com as diretrizes de segurança e a whitelist do Mestre do PC."
        ),
        capabilities=types.SubagentCapabilities(
            agent_behavior=types.AgentBehavior.AUTONOMOUS,
            enabled_tools=[types.BuiltinTools.VIEW_FILE],
        ),
    )


# ==============================================================================
# 3. Construção da Configuração do Agente
# ==============================================================================

def construir_config(
    api_key: str | None = None,
    usar_ollama: bool = False,
    ollama_model: str = "llama3.1",
    ollama_url: str = "http://127.0.0.1:11434/v1",
):
    """Monta a configuração do agente Antigravity com MCP e ferramentas locais."""

    # Configura conexão MCP via stdio com mcp-server/index.js
    mcp_server = types.McpStdioServer(
        name="mestre_pc_mcp",
        command="node",
        args=[str(MCP_SERVER_JS)],
        env={
            **os.environ,
            "MESTRE_BASE_URL": os.environ.get("MESTRE_BASE_URL", "http://127.0.0.1:7777"),
        },
    )

    # Ferramentas nativas em Python
    tools = [verificar_saude_launcher, registrar_evento_sessao]

    # Subagente auditor
    auditor = criar_subagente_auditor()

    # Políticas de execução: permite as ferramentas nativas e MCP
    policies = [
        policy.allow(mcp_server),
    ]

    instrucoes_sistema = (
        "Você é o Agente Inteligente do Mestre do PC V10, baseado no Google Antigravity SDK.\n"
        "Suas responsabilidades:\n"
        "1. Auxiliar no diagnóstico e manutenção do sistema operacional Windows.\n"
        "2. Interagir com o servidor MCP oficial ('mestre_pc_mcp') para operações administrativas.\n"
        "3. Nunca tente contornar a whitelist do launcher. Todo comando passa pela whitelist.\n"
        "4. Sempre que identificar diagnósticos ou ações importantes, registre via 'registrar_evento_sessao'.\n"
        "5. Para auditorias formais e validação de segurança, delegue para o subagente 'auditor_mestre'.\n"
        "Responda sempre em português do Brasil (pt-BR)."
    )

    capabilities = types.CapabilitiesConfig(
        enable_subagents=True,
        max_subagent_depth=2,
        allowed_subagents=["auditor_mestre"],
    )

    # Decisão de backend: Gemini (nuvem) vs Ollama (local)
    chave_gemini = api_key or os.environ.get("GEMINI_API_KEY")

    if usar_ollama or not chave_gemini:
        print(f"[*] Modo Local: Conectando via Ollama em {ollama_url} (modelo: {ollama_model})")
        return LocalOpenAIAgentConfig(
            model=ollama_model,
            base_url=ollama_url,
            system_instructions=instrucoes_sistema,
            capabilities=capabilities,
            subagents=[auditor],
            tools=tools,
            mcp_servers=[mcp_server],
            policies=policies,
        )
    else:
        print("[*] Modo Gemini: Conectando com modelo hospedado na nuvem (gemini-2.5-flash)")
        return LocalAgentConfig(
            model="gemini-2.5-flash",
            api_key=chave_gemini,
            system_instructions=instrucoes_sistema,
            capabilities=capabilities,
            subagents=[auditor],
            tools=tools,
            mcp_servers=[mcp_server],
            policies=policies,
        )


# ==============================================================================
# 4. Execução Principal
# ==============================================================================

async def executar(prompt: str, args):
    if not MCP_SERVER_JS.exists():
        print(f"ERRO: Arquivo MCP não encontrado em: {MCP_SERVER_JS}", file=sys.stderr)
        sys.exit(1)

    config = construir_config(
        api_key=args.api_key,
        usar_ollama=args.ollama,
        ollama_model=args.model,
    )

    print(f"\n[Prompt]: {prompt}\n---")

    async with Agent(config=config) as agent:
        response = await agent.chat(prompt)
        async for chunk in response:
            print(chunk, end="", flush=True)
        print("\n---")


def main():
    parser = argparse.ArgumentParser(
        description="Agente Google Antigravity SDK integrado ao Mestre do PC V10."
    )
    parser.add_argument(
        "--prompt", "-p",
        type=str,
        default="Verifique se o launcher do Mestre do PC está ativo e registre o status da sessão.",
        help="Prompt a ser executado pelo agente."
    )
    parser.add_argument(
        "--api-key",
        type=str,
        default=None,
        help="Chave de API do Gemini (ou defina GEMINI_API_KEY no ambiente)."
    )
    parser.add_argument(
        "--ollama",
        action="store_true",
        help="Força uso do Ollama local em http://127.0.0.1:11434/v1."
    )
    parser.add_argument(
        "--model",
        type=str,
        default="llama3.1",
        help="Nome do modelo Ollama (padrão: llama3.1)."
    )

    args = parser.parse_args()
    asyncio.run(executar(args.prompt, args))


if __name__ == "__main__":
    main()
