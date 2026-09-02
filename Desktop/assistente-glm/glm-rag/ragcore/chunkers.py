"""Chunking estrutural.

Regra: nunca cortar por contagem de caracteres quando o arquivo tem estrutura
própria. Python vira funções via AST; SKILL.md vira steps; workflow_schema.json
vira um chunk por parâmetro e por step; Markdown vira seções por heading.
"""
from __future__ import annotations

import ast
import hashlib
import json
import re
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Iterator

from .config import MAX_CHARS, LOG_CHUNK_LINES
from .sanitize import sanitize, is_worth_indexing


@dataclass
class Chunk:
    text: str
    source: str          # skills | code | obsidian | docs | logs
    kind: str            # function | step | parameter | section | overview | raw
    path: str
    title: str = ""
    meta: dict = field(default_factory=dict)

    @property
    def id(self) -> str:
        h = hashlib.sha1(f"{self.path}|{self.kind}|{self.title}|{self.text[:200]}".encode())
        return h.hexdigest()[:20]

    def to_row(self) -> dict:
        d = asdict(self)
        meta = d.pop("meta")
        # Chroma só aceita escalares em metadata
        for k, v in meta.items():
            d[k] = v if isinstance(v, (str, int, float, bool)) else json.dumps(v, ensure_ascii=False)
        d["id"] = self.id
        return d


def _split_long(text: str, limit: int = MAX_CHARS) -> list[str]:
    """Fallback quando um bloco estrutural é grande demais. Quebra em
    parágrafos, nunca no meio de uma linha."""
    if len(text) <= limit:
        return [text]
    parts, buf = [], []
    size = 0
    for para in text.split("\n\n"):
        if size + len(para) > limit and buf:
            parts.append("\n\n".join(buf))
            buf, size = [], 0
        buf.append(para)
        size += len(para) + 2
    if buf:
        parts.append("\n\n".join(buf))
    return parts


# --------------------------------------------------------------------------
# Python — AST
# --------------------------------------------------------------------------
PY_START = re.compile(r"^(#!|# -\*-|import |from |def |class |@|\"\"\"|'''|__)")


def _parse_python(text: str):
    """Tenta parsear. Se falhar, descarta lixo do topo (prompt de shell, linha
    de `cat`, diff markers) até a primeira linha plausivelmente Python."""
    try:
        return ast.parse(text), text
    except SyntaxError:
        pass
    lines = text.splitlines()
    for i, line in enumerate(lines[:15]):
        if PY_START.match(line):
            candidate = "\n".join(lines[i:])
            try:
                return ast.parse(candidate), candidate
            except SyntaxError:
                continue
    return None, text


def chunk_python(path: Path, raw: str, source: str) -> Iterator[Chunk]:
    text = sanitize(raw)
    tree, text = _parse_python(text)
    if tree is None:
        yield from chunk_plain(path, text, source, kind="raw")
        return

    lines = text.splitlines()
    covered: set[int] = set()

    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        start = min([node.lineno] + [d.lineno for d in node.decorator_list]) - 1
        end = node.end_lineno
        covered.update(range(start, end))
        body = "\n".join(lines[start:end])
        doc = ast.get_docstring(node) or ""
        # Assinatura + docstring no topo melhoram muito o recall da busca densa.
        header = f"# {path.name} :: {node.name}\n# {doc.splitlines()[0] if doc else ''}\n"
        for i, piece in enumerate(_split_long(body)):
            yield Chunk(
                text=header + piece,
                source=source, kind="function", path=str(path), title=node.name,
                meta={"lang": "python", "docstring": doc[:300], "part": i},
            )

    rest = "\n".join(l for i, l in enumerate(lines) if i not in covered)
    if is_worth_indexing(rest, 80):
        yield Chunk(text=f"# {path.name} :: module level\n{rest}", source=source,
                    kind="module", path=str(path), title=path.stem,
                    meta={"lang": "python"})


# --------------------------------------------------------------------------
# JS / TS — regex pragmática (evita dependência de parser externo)
# --------------------------------------------------------------------------
JS_DECL = re.compile(
    r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?"
    r"(?:function\s+(?P<fn>\w+)|class\s+(?P<cls>\w+)|"
    r"(?:const|let|var)\s+(?P<arrow>\w+)\s*=\s*(?:async\s*)?\()",
    re.MULTILINE,
)


def chunk_js(path: Path, raw: str, source: str) -> Iterator[Chunk]:
    text = sanitize(raw)
    marks = [(m.start(), m.group("fn") or m.group("cls") or m.group("arrow"))
             for m in JS_DECL.finditer(text)]
    if not marks:
        yield from chunk_plain(path, text, source, kind="raw")
        return
    marks.append((len(text), ""))
    for (start, name), (end, _) in zip(marks, marks[1:]):
        body = text[start:end].strip()
        if not is_worth_indexing(body, 30):
            continue
        for i, piece in enumerate(_split_long(body)):
            yield Chunk(text=f"// {path.name} :: {name}\n{piece}", source=source,
                        kind="function", path=str(path), title=name,
                        meta={"lang": path.suffix.lstrip("."), "part": i})


# --------------------------------------------------------------------------
# workflow_schema.json — um chunk por parâmetro e por step
# --------------------------------------------------------------------------
def chunk_workflow_schema(path: Path, raw: str, source: str) -> Iterator[Chunk]:
    try:
        s = json.loads(raw)
    except json.JSONDecodeError:
        return
    wf = s.get("workflow_name", path.parent.name)

    overview = (
        f"Workflow: {s.get('workflow_display_name', wf)} ({wf}) v{s.get('version','?')}\n"
        f"{s.get('description','')}\n"
        f"Parâmetros: {', '.join(p.get('name','?') for p in s.get('parameters', []))}\n"
        f"Steps: {', '.join(str(st.get('step_name','?')) for st in s.get('steps', []))}"
    )
    yield Chunk(text=overview, source=source, kind="overview", path=str(path),
                title=wf, meta={"workflow": wf, "version": str(s.get("version", ""))})

    for p in s.get("parameters", []):
        body = (
            f"Parâmetro '{p.get('name')}' do workflow {wf}\n"
            f"Nome de exibição: {p.get('display_name')}\n"
            f"Tipo: {p.get('type')} | obrigatório: {p.get('required')} | "
            f"default: {json.dumps(p.get('default'), ensure_ascii=False)}\n"
            f"{p.get('description','')}"
        )
        if p.get("options"):
            body += f"\nOpções: {p['options']}"
        yield Chunk(text=body, source=source, kind="parameter", path=str(path),
                    title=str(p.get("name")),
                    meta={"workflow": wf, "type": str(p.get("type")),
                          "required": bool(p.get("required"))})

    for st in s.get("steps", []):
        used = st.get("parameters_used", [])
        body = (
            f"Step {st.get('step_number')} '{st.get('step_name')}' do workflow {wf}\n"
            f"{st.get('display_name')}\n{st.get('description','')}\n"
            f"Usa os parâmetros: {', '.join(used) if used else 'nenhum'}"
        )
        yield Chunk(text=body, source=source, kind="step", path=str(path),
                    title=str(st.get("step_name")),
                    meta={"workflow": wf,
                          "step_number": int(st.get("step_number", 0)),
                          # aresta do grafo: step -> parâmetros
                          "parameters_used": ",".join(used)})


# --------------------------------------------------------------------------
# Markdown (SKILL.md, Obsidian, docs) — seções por heading
# --------------------------------------------------------------------------
HEADING = re.compile(r"^(#{1,4})\s+(.*)$", re.MULTILINE)
WIKILINK = re.compile(r"\[\[([^\]|]+)")
TAG = re.compile(r"(?:^|\s)#([\w/-]{2,})")


def chunk_markdown(path: Path, raw: str, source: str) -> Iterator[Chunk]:
    text = sanitize(raw)
    links = ",".join(sorted(set(WIKILINK.findall(text)))[:20])
    tags = ",".join(sorted(set(TAG.findall(text)))[:20])

    heads = list(HEADING.finditer(text))
    if not heads:
        yield from chunk_plain(path, text, source, kind="section",
                               extra={"links": links, "tags": tags})
        return

    if heads[0].start() > 0:
        preamble = text[: heads[0].start()].strip()
        if is_worth_indexing(preamble):
            yield Chunk(text=preamble, source=source, kind="section", path=str(path),
                        title=path.stem, meta={"links": links, "tags": tags})

    bounds = [h.start() for h in heads] + [len(text)]
    for h, start, end in zip(heads, bounds, bounds[1:]):
        title = h.group(2).strip()
        body = text[start:end].strip()
        if not is_worth_indexing(body, 30):
            continue
        kind = "step" if re.match(r"Step\s+\d+", title, re.I) else "section"
        for i, piece in enumerate(_split_long(body)):
            yield Chunk(
                text=f"[{path.stem}] {piece}", source=source, kind=kind,
                path=str(path), title=title,
                meta={"level": len(h.group(1)), "links": links, "tags": tags, "part": i},
            )


# --------------------------------------------------------------------------
# Logs — janelas de linhas, priorizando erros
# --------------------------------------------------------------------------
ERR = re.compile(r"(?i)\b(error|erro|exception|traceback|fail|fatal|critical)\b")


def chunk_logs(path: Path, raw: str, source: str) -> Iterator[Chunk]:
    lines = sanitize(raw).splitlines()
    for i in range(0, len(lines), LOG_CHUNK_LINES):
        window = lines[i: i + LOG_CHUNK_LINES]
        body = "\n".join(window)
        if not body.strip():
            continue
        yield Chunk(text=f"[log {path.name} L{i+1}]\n{body}", source=source,
                    kind="log", path=str(path), title=f"{path.name}:{i+1}",
                    meta={"has_error": bool(ERR.search(body)), "line_start": i + 1})


# --------------------------------------------------------------------------
def chunk_plain(path: Path, raw: str, source: str, kind: str = "raw",
                extra: dict | None = None) -> Iterator[Chunk]:
    text = sanitize(raw)
    if not is_worth_indexing(text):
        return
    for i, piece in enumerate(_split_long(text)):
        yield Chunk(text=piece, source=source, kind=kind, path=str(path),
                    title=path.stem, meta={**(extra or {}), "part": i})


def chunk_pdf(path: Path, source: str) -> Iterator[Chunk]:
    try:
        import pypdf
    except ImportError:
        return
    try:
        reader = pypdf.PdfReader(str(path))
    except Exception:
        return
    for n, page in enumerate(reader.pages, 1):
        text = sanitize(page.extract_text() or "")
        if not is_worth_indexing(text, 80):
            continue
        for i, piece in enumerate(_split_long(text)):
            yield Chunk(text=piece, source=source, kind="page", path=str(path),
                        title=f"{path.stem} p.{n}", meta={"page": n, "part": i})


def dispatch(path: Path, source: str) -> Iterator[Chunk]:
    """Roteia o arquivo para o chunker certo."""
    suf = path.suffix.lower()
    if suf == ".pdf":
        yield from chunk_pdf(path, source)
        return
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return

    if path.name == "workflow_schema.json":
        yield from chunk_workflow_schema(path, raw, source)
    elif suf == ".py":
        yield from chunk_python(path, raw, source)
    elif suf in {".ts", ".js", ".mjs", ".tsx", ".jsx"}:
        yield from chunk_js(path, raw, source)
    elif suf == ".md":
        yield from chunk_markdown(path, raw, source)
    elif suf in {".log", ".jsonl"}:
        yield from chunk_logs(path, raw, source)
    else:
        yield from chunk_plain(path, raw, source)
