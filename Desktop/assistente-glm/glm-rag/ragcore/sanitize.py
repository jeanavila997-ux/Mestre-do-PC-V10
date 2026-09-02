"""Remove lixo de alta entropia antes da indexação.

Motivado pelo caso real: um validate_workflow.py de 500 linhas em que 217
(~44%) eram bloco de assinatura Windows Authenticode em base64. Sem este
filtro, quase metade dos chunks seria certificado da Microsoft, envenenando
toda busca por similaridade.
"""
from __future__ import annotations

import re

BLOCK_START = (
    "# SIG # Begin Windows Authenticode signature block",
    "-----BEGIN CERTIFICATE-----",
    "-----BEGIN PGP SIGNATURE-----",
    "-----BEGIN RSA PRIVATE KEY-----",
    "-----BEGIN OPENSSH PRIVATE KEY-----",
)
BLOCK_END = (
    "# SIG # End Windows Authenticode signature block",
    "-----END CERTIFICATE-----",
    "-----END PGP SIGNATURE-----",
    "-----END RSA PRIVATE KEY-----",
    "-----END OPENSSH PRIVATE KEY-----",
)

SHELL_PROMPT = re.compile(r"^[\w.-]+@[\w.-]+:[^\s]*[$#]\s*_?$")
B64_CHARS = re.compile(r"^[A-Za-z0-9+/=]+$")

# Segredos: neutralizados, não descartados — o agente precisa saber que a
# variável existe, mas o valor nunca deve entrar no índice.
SECRET = re.compile(
    r"(?i)\b((?:api[_-]?key|secret|token|password|passwd|authorization|bearer)"
    r"\s*[:=]\s*)(\S+)"
)


def _is_b64_noise(line: str) -> bool:
    """Linha longa, sem espaços e quase toda base64 → ruído."""
    s = line.lstrip("#/* \t")
    if len(s) < 60 or " " in s.strip():
        return False
    return bool(B64_CHARS.match(s.strip()))


def sanitize(text: str) -> str:
    out, in_block, b64_run = [], False, 0

    for line in text.splitlines():
        stripped = line.strip()

        if not in_block and any(m in line for m in BLOCK_START):
            in_block = True
            continue
        if in_block:
            if any(m in line for m in BLOCK_END):
                in_block = False
            continue

        if SHELL_PROMPT.match(stripped):
            continue

        # 3+ linhas base64 seguidas: bloco não delimitado, corta.
        if _is_b64_noise(stripped):
            b64_run += 1
            if b64_run >= 3:
                continue
            out.append(line)
            continue
        if b64_run >= 3:
            del out[-min(2, len(out)):]  # remove as 2 que já tinham passado
        b64_run = 0

        out.append(SECRET.sub(r"\1<REDACTED>", line))

    # Colapsa linhas vazias excedentes
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()


def is_worth_indexing(text: str, min_chars: int = 40) -> bool:
    if len(text.strip()) < min_chars:
        return False
    alpha = sum(c.isalpha() or c.isspace() for c in text)
    return alpha / max(len(text), 1) > 0.5
