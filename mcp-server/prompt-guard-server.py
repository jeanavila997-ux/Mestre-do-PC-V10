#!/usr/bin/env python3
"""
Prompt Guard Server – Microserviço local para classificação de prompt injection.

Utiliza o modelo meta-llama/Prompt-Guard-2-86M (ou fallback heurístico)
para analisar prompts e detectar tentativas de injeção, jailbreak ou
conteúdo malicioso.

Requisitos:
    pip install transformers torch

Uso:
    python prompt-guard-server.py
    # Envia POST para http://127.0.0.1:7778/classify
    # Body JSON: {"prompt": "texto a analisar"}
"""

import json
import re
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

# Configurações
HOST = "127.0.0.1"
PORT = 7778
MODEL_NAME = "meta-llama/Prompt-Guard-2-86M"

# Tentativa de importar transformers
try:
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    import torch
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    print("[AVISO] transformers/torch nao instalados. Usando fallback heuristico.")
    print("Para usar o modelo real: pip install transformers torch")

# Carrega modelo se disponível
model = None
tokenizer = None
if TRANSFORMERS_AVAILABLE:
    try:
        print(f"[INFO] Carregando modelo {MODEL_NAME}...")
        tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
        model.eval()
        print("[OK] Modelo carregado com sucesso.")
    except Exception as e:
        print(f"[ERRO] Falha ao carregar modelo: {e}")
        print("[INFO] Usando fallback heuristico.")
        model = None
        tokenizer = None


def heuristic_check(text):
    """Fallback heuristico quando o modelo não está disponível."""
    lower = text.lower()
    patterns = [
        (r"ignore\s+(all\s+)?previous\s+(instructions?|commands?|prompts?)", 0.9, "ignore previous instructions"),
        (r"forget\s+(everything|all\s+previous|your\s+instructions)", 0.85, "forget instructions"),
        (r"(you\s+are\s+now|from\s+now\s+on\s+you\s+are)", 0.8, "persona override"),
        (r"(disregard|override|bypass|circumvent)\s+(rules?|restrictions?|safety|security)", 0.85, "bypass rules"),
        (r"system\s*[:\-]?\s*prompt|developer\s*mode|admin\s*mode|DAN\s*mode", 0.75, "system prompt leak / mode switch"),
        (r"<<<\s*sys\s*>>>|<<<\s*system\s*>>>|\[\s*system\s*\]|\[\s*inst\s*\]|<<<\s*instruction\s*>>>", 0.7, "delimitadores de sistema"),
        (r"new\s+instructions?[:\-]", 0.6, "new instructions"),
        (r"(jailbreak|prompt\s*injection|roleplay\s*as)", 0.65, "termos diretos"),
        (r"(sudo|admin|root)\s+access", 0.5, "privilege escalation"),
    ]
    total = 0.0
    matched = []
    for pat, weight, label in patterns:
        matches = re.findall(pat, text, re.IGNORECASE)
        if matches:
            total += weight * min(len(matches), 3)
            matched.append(label)
    score = min(total, 1.0)
    classification = "benigno"
    if score >= 0.7:
        classification = "malicioso"
    elif score >= 0.35:
        classification = "suspeito"
    return classification, round(score, 4), matched


def classify_with_model(text):
    """Classifica usando o modelo transformers."""
    if model is None or tokenizer is None:
        return None
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    with torch.no_grad():
        outputs = model(**inputs)
    probs = torch.softmax(outputs.logits, dim=-1)
    # Labels típicos: 0 = benigno, 1 = injeção direta, 2 = injeção indireta
    # (ajustar conforme documentação do modelo)
    pred = torch.argmax(probs, dim=-1).item()
    score = probs[0][pred].item()
    labels = ["benigno", "injecao_direta", "injecao_indireta"]
    classification = labels[pred] if pred < len(labels) else "desconhecido"
    return classification, round(score, 4), []


def classify(text):
    """Roteia entre modelo real e fallback heuristico."""
    if model is not None:
        result = classify_with_model(text)
        if result:
            return result
    return heuristic_check(text)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Silencia logs por padrão
        pass

    def _json_response(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def do_POST(self):
        if self.path != "/classify":
            self._json_response(404, {"error": "not found"})
            return
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(body)
            prompt = payload.get("prompt", "")
            classification, score, matched = classify(prompt)
            self._json_response(200, {
                "prompt": prompt[:200],
                "classification": classification,
                "score": score,
                "matched_patterns": matched,
                "model_used": "transformers" if model is not None else "heuristic_fallback",
            })
        except Exception as e:
            self._json_response(500, {"error": str(e)})

    def do_GET(self):
        if self.path == "/health":
            self._json_response(200, {"status": "ok", "model_loaded": model is not None})
            return
        self._json_response(404, {"error": "not found"})


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), Handler)
    print(f"[OK] Prompt Guard Server rodando em http://{HOST}:{PORT}")
    print(f"[INFO] Endpoint POST /classify  |  GET /health")
    print("[INFO] Pressione Ctrl+C para encerrar.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Encerrando...")
        server.shutdown()
