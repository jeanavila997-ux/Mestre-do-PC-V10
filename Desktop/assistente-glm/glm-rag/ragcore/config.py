"""Configuração central. Ajuste os caminhos ao seu ambiente."""
from __future__ import annotations

import os
from pathlib import Path

# --- Raízes indexadas -------------------------------------------------------
AGENT_ROOT = Path(os.getenv("GLM_AGENT_ROOT", r"C:\Users\JEANPC\Desktop\assistente-glm"))
OBSIDIAN_ROOT = Path(os.getenv("GLM_OBSIDIAN_ROOT", r"C:\Users\JEANPC\Documents\Obsidian"))
DOCS_ROOT = Path(os.getenv("GLM_DOCS_ROOT", str(AGENT_ROOT / "docs")))
LOGS_ROOT = Path(os.getenv("GLM_LOGS_ROOT", str(AGENT_ROOT / "logs")))

# Onde o índice vive. Fora do repo do agente, para não poluir o git.
INDEX_DIR = Path(os.getenv("GLM_INDEX_DIR", str(Path.home() / ".glm-rag")))

# --- Fontes -----------------------------------------------------------------
# Cada fonte vira um filtro de metadata na busca (source=...).
SOURCES = {
    "skills":   {"root": AGENT_ROOT, "globs": ["**/SKILL.md", "**/workflow_schema.json"]},
    "code":     {"root": AGENT_ROOT, "globs": ["**/*.py", "**/*.ts", "**/*.js", "**/*.mjs"]},
    "obsidian": {"root": OBSIDIAN_ROOT, "globs": ["**/*.md"]},
    "docs":     {"root": DOCS_ROOT, "globs": ["**/*.md", "**/*.txt", "**/*.pdf"]},
    "logs":     {"root": LOGS_ROOT, "globs": ["**/*.log", "**/*.jsonl"]},
}

EXCLUDE_DIRS = {
    "node_modules", ".git", "__pycache__", ".venv", "venv", "dist", "build",
    ".next", ".cache", "site-packages", ".pytest_cache", ".mypy_cache",
}

# --- Embeddings -------------------------------------------------------------
# multilingual-e5-small: leve (~130MB ONNX), roda em CPU, entende PT-BR.
TEXT_MODEL = os.getenv("GLM_TEXT_MODEL", "intfloat/multilingual-e5-small")
# jina-embeddings-v2-base-code: especializado em código.
CODE_MODEL = os.getenv("GLM_CODE_MODEL", "jinaai/jina-embeddings-v2-base-code")

# --- Retrieval --------------------------------------------------------------
TOP_K = 8
CANDIDATES = 40      # candidatos por ramo (denso e esparso) antes do RRF
RRF_K = 60           # constante do Reciprocal Rank Fusion
MAX_CHARS = 2000     # teto de um chunk antes de subdividir
LOG_CHUNK_LINES = 60 # linhas por chunk de log
