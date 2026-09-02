"""Ingestão. Uso:

    python -m ragcore.ingest              # incremental (só o que mudou)
    python -m ragcore.ingest --full       # reconstrói do zero
    python -m ragcore.ingest --source obsidian
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from .config import SOURCES, EXCLUDE_DIRS, INDEX_DIR
from .chunkers import dispatch
from .index import HybridIndex

MANIFEST = INDEX_DIR / "manifest.json"
MAX_FILE_MB = 8


def walk(root: Path, globs: list[str]):
    if not root.exists():
        return
    seen = set()
    for pattern in globs:
        for p in root.glob(pattern):
            if not p.is_file() or p in seen:
                continue
            if EXCLUDE_DIRS & set(p.parts):
                continue
            try:
                if p.stat().st_size > MAX_FILE_MB * 1024 * 1024:
                    continue
            except OSError:
                continue
            seen.add(p)
            yield p


def load_manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text(encoding="utf-8"))
    return {}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="apaga e reconstrói o índice")
    ap.add_argument("--source", help="indexa apenas uma fonte")
    args = ap.parse_args()

    idx = HybridIndex()
    if args.full:
        print("Limpando índice...")
        idx.reset()
        MANIFEST.unlink(missing_ok=True)

    manifest = {} if args.full else load_manifest()
    targets = {args.source: SOURCES[args.source]} if args.source else SOURCES

    t0 = time.time()
    grand_total = 0

    for name, cfg in targets.items():
        root = Path(cfg["root"])
        if not root.exists():
            print(f"  [skip] {name}: {root} não existe")
            continue

        chunks, n_files, n_skipped = [], 0, 0
        for path in walk(root, cfg["globs"]):
            key = str(path)
            try:
                sig = f"{path.stat().st_mtime_ns}:{path.stat().st_size}"
            except OSError:
                continue
            if manifest.get(key) == sig:
                n_skipped += 1
                continue
            produced = list(dispatch(path, name))
            chunks.extend(produced)
            manifest[key] = sig
            n_files += 1

        if chunks:
            written = idx.add(chunks)
            grand_total += written
            print(f"  {name:9} {n_files:4} arquivos → {written:5} chunks "
                  f"({n_skipped} inalterados)")
        else:
            print(f"  {name:9} nada novo ({n_skipped} inalterados)")

    if grand_total or args.full:
        print("Reconstruindo índice BM25...")
        print(f"  {idx.build_bm25()} documentos no BM25")

    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")

    print(f"\nConcluído em {time.time()-t0:.1f}s → {idx.stats()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
