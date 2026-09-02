"""Servidor MCP stdio da RAG do assistente-glm.

Expõe quatro tools. Qualquer cliente MCP — o lado Python do agente, o lado
Node, Claude Desktop — consome a mesma base sem reimplementar nada.

    python server.py
"""
from __future__ import annotations

import asyncio
import json

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

from ragcore.index import HybridIndex

app = Server("glm-rag")
_idx: HybridIndex | None = None


def idx() -> HybridIndex:
    global _idx
    if _idx is None:
        _idx = HybridIndex()
    return _idx


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="buscar_conhecimento",
            description=(
                "Busca híbrida (semântica + literal) na base do assistente-glm: "
                "skills, workflows, código-fonte, notas do Obsidian, docs e logs. "
                "Use antes de responder qualquer coisa sobre o projeto."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "consulta": {"type": "string", "description": "Pergunta ou termos de busca"},
                    "fonte": {
                        "type": "string",
                        "enum": ["skills", "code", "obsidian", "docs", "logs"],
                        "description": "Restringe a uma fonte. Omita para buscar em tudo.",
                    },
                    "tipo": {
                        "type": "string",
                        "enum": ["function", "step", "parameter", "section", "overview", "log"],
                        "description": "Restringe ao tipo de chunk.",
                    },
                    "k": {"type": "integer", "default": 8, "minimum": 1, "maximum": 25},
                },
                "required": ["consulta"],
            },
        ),
        Tool(
            name="quem_usa_parametro",
            description=(
                "Percorre o grafo step→parameters_used. Responde 'o que quebra "
                "se eu renomear/remover este parâmetro'. Exato, não semântico."
            ),
            inputSchema={
                "type": "object",
                "properties": {"parametro": {"type": "string"}},
                "required": ["parametro"],
            },
        ),
        Tool(
            name="ler_arquivo_indexado",
            description="Retorna todos os chunks de um arquivo específico, em ordem.",
            inputSchema={
                "type": "object",
                "properties": {"caminho": {"type": "string"}},
                "required": ["caminho"],
            },
        ),
        Tool(
            name="status_indice",
            description="Contagem de chunks por coleção e caminho do índice.",
            inputSchema={"type": "object", "properties": {}},
        ),
    ]


def _fmt(hits: list[dict]) -> str:
    if not hits:
        return "Nenhum resultado. Tente termos mais específicos ou remova o filtro de fonte."
    out = []
    for i, h in enumerate(hits, 1):
        m = h.get("meta", {})
        head = f"[{i}] {m.get('source','?')}/{m.get('kind','?')} · {m.get('title') or ''}"
        out.append(f"{head}\n    {m.get('path','')}\n{h['document'][:1500]}")
    return "\n\n---\n\n".join(out)


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    try:
        if name == "buscar_conhecimento":
            hits = idx().search(
                arguments["consulta"],
                k=int(arguments.get("k", 8)),
                source=arguments.get("fonte"),
                kind=arguments.get("tipo"),
            )
            return [TextContent(type="text", text=_fmt(hits))]

        if name == "quem_usa_parametro":
            hits = idx().neighbors(arguments["parametro"])
            if not hits:
                return [TextContent(
                    type="text",
                    text=f"Nenhum step declara '{arguments['parametro']}' em parameters_used.")]
            body = "\n\n".join(
                f"· {h['meta'].get('workflow')} / step {h['meta'].get('step_number')} "
                f"({h['meta'].get('title')})\n{h['document'][:600]}" for h in hits)
            return [TextContent(type="text", text=body)]

        if name == "ler_arquivo_indexado":
            hits = idx().search(arguments["caminho"], k=25)
            alvo = [h for h in hits
                    if arguments["caminho"].lower() in h["meta"].get("path", "").lower()]
            return [TextContent(type="text", text=_fmt(alvo or hits))]

        if name == "status_indice":
            return [TextContent(type="text",
                                text=json.dumps(idx().stats(), indent=2, ensure_ascii=False))]

        return [TextContent(type="text", text=f"Tool desconhecida: {name}")]

    except Exception as e:
        return [TextContent(type="text", text=f"Erro em {name}: {type(e).__name__}: {e}")]


async def main():
    async with stdio_server() as (read, write):
        await app.run(read, write, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
