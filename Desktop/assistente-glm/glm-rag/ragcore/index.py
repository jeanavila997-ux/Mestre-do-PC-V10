"""Índice híbrido: denso (Chroma + fastembed) + esparso (BM25), fundidos por RRF.

Por que híbrido: busca densa sozinha erra consultas com identificadores literais
("duplicate step_number", "parameters_used", nome de função). BM25 acerta esses
e falha em paráfrase. RRF combina os dois rankings sem precisar calibrar pesos.
"""
from __future__ import annotations

import json
import pickle
import re
from pathlib import Path

import chromadb
from chromadb.config import Settings

from .config import INDEX_DIR, TEXT_MODEL, CODE_MODEL, TOP_K, CANDIDATES, RRF_K

CODE_KINDS = {"function", "module"}
_TOKEN = re.compile(r"[a-z0-9_]+")


def tokenize(s: str) -> list[str]:
    """Tokeniza preservando snake_case e quebrando camelCase — nomes de
    parâmetro e função precisam casar literalmente."""
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", s)
    return _TOKEN.findall(s.lower())


class HybridIndex:
    def __init__(self, path: Path = INDEX_DIR):
        self.path = Path(path)
        self.path.mkdir(parents=True, exist_ok=True)
        self.client = chromadb.PersistentClient(
            path=str(self.path / "chroma"),
            settings=Settings(anonymized_telemetry=False),
        )
        self._embedders: dict[str, object] = {}
        self._bm25 = None
        self._bm25_ids: list[str] = []

    # -- embeddings ---------------------------------------------------------
    def _embedder(self, model: str):
        if model not in self._embedders:
            from fastembed import TextEmbedding
            self._embedders[model] = TextEmbedding(model_name=model)
        return self._embedders[model]

    def embed(self, texts: list[str], model: str) -> list[list[float]]:
        return [v.tolist() for v in self._embedder(model).embed(texts)]

    def _collection(self, name: str):
        return self.client.get_or_create_collection(
            name, metadata={"hnsw:space": "cosine"}
        )

    # -- escrita ------------------------------------------------------------
    def add(self, chunks: list) -> int:
        """Grava em duas coleções: 'text' e 'code'. Modelos diferentes não
        podem dividir o mesmo espaço vetorial."""
        buckets: dict[str, list] = {"text": [], "code": []}
        for c in chunks:
            buckets["code" if c.kind in CODE_KINDS else "text"].append(c)

        total = 0
        for bucket, items in buckets.items():
            if not items:
                continue
            model = CODE_MODEL if bucket == "code" else TEXT_MODEL
            col = self._collection(bucket)
            for i in range(0, len(items), 128):
                batch = items[i: i + 128]
                rows = [c.to_row() for c in batch]
                # e5 exige o prefixo "passage:" nos documentos indexados
                prefix = "passage: " if "e5" in model and bucket == "text" else ""
                col.upsert(
                    ids=[r.pop("id") for r in rows],
                    documents=[c.text for c in batch],
                    embeddings=self.embed([prefix + c.text for c in batch], model),
                    metadatas=[{k: v for k, v in r.items() if k != "text"} for r in rows],
                )
                total += len(batch)
        return total

    def build_bm25(self) -> int:
        from rank_bm25 import BM25Okapi
        corpus, ids, meta = [], [], []
        for bucket in ("text", "code"):
            try:
                data = self._collection(bucket).get(include=["documents", "metadatas"])
            except Exception:
                continue
            for _id, doc, md in zip(data["ids"], data["documents"], data["metadatas"]):
                # título entra duas vezes: peso extra para nome de função/param
                title = (md or {}).get("title", "")
                corpus.append(tokenize(f"{title} {title} {doc}"))
                ids.append(_id)
                meta.append({"bucket": bucket, **(md or {}), "document": doc})
        if not corpus:
            return 0
        with open(self.path / "bm25.pkl", "wb") as f:
            pickle.dump({"bm25": BM25Okapi(corpus), "ids": ids, "meta": meta}, f)
        return len(ids)

    def _load_bm25(self):
        if self._bm25 is None:
            p = self.path / "bm25.pkl"
            if not p.exists():
                return None
            with open(p, "rb") as f:
                self._bm25 = pickle.load(f)
        return self._bm25

    # -- leitura ------------------------------------------------------------
    def search(self, query: str, k: int = TOP_K, source: str | None = None,
               kind: str | None = None) -> list[dict]:
        where = {}
        if source:
            where["source"] = source
        if kind:
            where["kind"] = kind
        where = where or None

        ranks: dict[str, dict] = {}

        # ramo denso — consulta ambas as coleções
        for bucket in ("text", "code"):
            model = CODE_MODEL if bucket == "code" else TEXT_MODEL
            prefix = "query: " if "e5" in model and bucket == "text" else ""
            try:
                col = self._collection(bucket)
                if col.count() == 0:
                    continue
                res = col.query(
                    query_embeddings=self.embed([prefix + query], model),
                    n_results=min(CANDIDATES, col.count()),
                    where=where,
                    include=["documents", "metadatas", "distances"],
                )
            except Exception:
                continue
            for rank, (_id, doc, md) in enumerate(
                zip(res["ids"][0], res["documents"][0], res["metadatas"][0])
            ):
                e = ranks.setdefault(_id, {"id": _id, "document": doc,
                                           "meta": md or {}, "score": 0.0})
                e["score"] += 1.0 / (RRF_K + rank + 1)

        # ramo esparso
        store = self._load_bm25()
        if store:
            scores = store["bm25"].get_scores(tokenize(query))
            order = sorted(range(len(scores)), key=lambda i: -scores[i])[:CANDIDATES]
            for rank, i in enumerate(order):
                if scores[i] <= 0:
                    continue
                md = store["meta"][i]
                if source and md.get("source") != source:
                    continue
                if kind and md.get("kind") != kind:
                    continue
                e = ranks.setdefault(store["ids"][i], {
                    "id": store["ids"][i], "document": md.get("document", ""),
                    "meta": md, "score": 0.0})
                e["score"] += 1.0 / (RRF_K + rank + 1)

        out = sorted(ranks.values(), key=lambda r: -r["score"])[:k]
        for r in out:
            r["meta"].pop("document", None)
        return out

    def neighbors(self, param_name: str) -> list[dict]:
        """Percorre a aresta step -> parameters_used. Responde 'o que quebra
        se eu renomear X' sem depender de similaridade semântica."""
        hits = []
        try:
            data = self._collection("text").get(
                where={"kind": "step"}, include=["documents", "metadatas"])
        except Exception:
            return hits
        for doc, md in zip(data["documents"], data["metadatas"]):
            used = (md or {}).get("parameters_used", "")
            if param_name in [u.strip() for u in used.split(",") if u.strip()]:
                hits.append({"document": doc, "meta": md})
        return hits

    def stats(self) -> dict:
        s = {}
        for bucket in ("text", "code"):
            try:
                s[bucket] = self._collection(bucket).count()
            except Exception:
                s[bucket] = 0
        s["bm25"] = len(self._load_bm25()["ids"]) if self._load_bm25() else 0
        s["path"] = str(self.path)
        return s

    def reset(self):
        for bucket in ("text", "code"):
            try:
                self.client.delete_collection(bucket)
            except Exception:
                pass
        (self.path / "bm25.pkl").unlink(missing_ok=True)
        self._bm25 = None
