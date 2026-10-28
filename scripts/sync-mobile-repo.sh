#!/usr/bin/env bash
# Publica v10/mobile/ no repositório jeanavila997-ux/mestre-do-pc-mobile.
# Sem --push, apenas lista a origem. O token fica em MOBILE_REPO_TOKEN, nunca na linha de comando.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/v10/mobile"
DEST_REPO="${MOBILE_REPO_URL:-https://github.com/jeanavila997-ux/mestre-do-pc-mobile.git}"
BRANCH="${MOBILE_REPO_BRANCH:-main}"
PUSH=0
if [[ "${1:-}" == "--push" ]]; then
  PUSH=1
fi

if [[ ! -d "$SRC" ]]; then
  echo "Pasta não encontrada: $SRC" >&2
  exit 1
fi

echo "Origem: $SRC"
find "$SRC" -type f | sed "s#^$SRC/##" | sort

if [[ "$PUSH" -ne 1 ]]; then
  echo "Nada foi publicado. Rode com --push para enviar a $DEST_REPO (branch $BRANCH)."
  exit 0
fi

if [[ -z "${MOBILE_REPO_TOKEN:-}" ]]; then
  echo "Aviso: MOBILE_REPO_TOKEN não está configurado. A publicação em ${DEST_REPO} foi ignorada."
  exit 0
fi

WORKDIR="$(mktemp -d)"
ASKPASS="$(mktemp)"
cleanup() {
  rm -rf "$WORKDIR"
  rm -f "$ASKPASS"
}
trap cleanup EXIT

cat > "$ASKPASS" <<'EOF'
#!/bin/sh
case "$1" in
  *Username*) printf '%s\n' "x-access-token" ;;
  *) printf '%s\n' "$MOBILE_REPO_TOKEN" ;;
esac
EOF
chmod 700 "$ASKPASS"
export GIT_ASKPASS="$ASKPASS"
export GIT_TERMINAL_PROMPT=0

CLONE_LOG="$WORKDIR/clone.err"
if ! git clone --depth 1 --branch "$BRANCH" "$DEST_REPO" "$WORKDIR/repo" 2>"$CLONE_LOG"; then
  if grep -Eqi "authentication|403|not found|could not read Username" "$CLONE_LOG"; then
    echo "Falha ao autenticar ou localizar $DEST_REPO." >&2
    exit 1
  fi
  mkdir -p "$WORKDIR/repo"
  git -C "$WORKDIR/repo" init -b "$BRANCH" >/dev/null
  git -C "$WORKDIR/repo" remote add origin "$DEST_REPO"
fi

rsync -a --delete \
  --exclude '.git' \
  --exclude '.github' \
  "$SRC/" "$WORKDIR/repo/"

git -C "$WORKDIR/repo" add -A
if git -C "$WORKDIR/repo" diff --cached --quiet; then
  echo "O repositório mobile já está igual a v10/mobile/."
  exit 0
fi

git -C "$WORKDIR/repo" \
  -c user.name="github-actions[bot]" \
  -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
  commit -m "Sync Mestre Mobile V11 a partir de Mestre-do-PC-V10"

git -C "$WORKDIR/repo" push origin "HEAD:${BRANCH}"
echo "Publicado em $DEST_REPO ($BRANCH)."
