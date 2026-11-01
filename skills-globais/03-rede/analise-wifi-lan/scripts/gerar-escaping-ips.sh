#!/usr/bin/env bash
# gerar-escaping-ips.sh — gera add_escaping_ips.sh (híbrido ipset + iptables)
#
# Correções vs. versão problemática:
#   1) ipset create escaping_ips e a regra iptables vão PARA O ARQUIVO (não só echo na tela)
#   2) ipset create dos *_block novos também são gravados no script
#   3) usa -exist / checagem antes de criar, para reexecução mais segura
#   4) DB_FILE configurável por env/arg (default: seu_banco.db)
#
# Uso:
#   DB_FILE=/caminho/seu_banco.db sudo -E ./gerar-escaping-ips.sh
#   ./gerar-escaping-ips.sh /caminho/seu_banco.db
#   ./add_escaping_ips.sh          # depois, como root
#
# Requer: sqlite3, ipset, iptables (no host Linux que aplica as regras)

set -euo pipefail

DB_FILE="${1:-${DB_FILE:-seu_banco.db}}"
OUT_SCRIPT="${OUT_SCRIPT:-add_escaping_ips.sh}"
MIN_OTHER="${MIN_OTHER:-3}"
IPSET_THRESHOLD="${IPSET_THRESHOLD:-20}"

if [[ ! -f "$DB_FILE" ]]; then
  echo "ERRO: banco não encontrado: $DB_FILE" >&2
  echo "Passe o caminho: $0 /caminho/seu_banco.db" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "ERRO: sqlite3 não está no PATH" >&2
  exit 1
fi

# Países que já têm conjuntos dedicados
declare -A COUNTRY_SET=(
  [CN]=cn_block
  [RU]=ru_block
  [IR]=ir_block
  [KP]=kp_block
  [VN]=vn_block
  [LT]=lt_block
  [TR]=tr_block
  [IN]=in_block
  [RO]=ro_block
  [TW]=tw_block
  [PH]=ph_block
  [HR]=hr_block
)

KNOWN_CODES_SQL="'CN','RU','IR','KP','VN','LT','TR','IN','RO','TW','PH','HR'"
# Excluídos da 2ª fase (já tratados OU não bloquear)
EXCLUDE_OTHER_SQL="${KNOWN_CODES_SQL},'BR','US'"

country_to_set() {
  local code="$1"
  echo "${COUNTRY_SET[$code]:-}"
}

# --- Cabeçalho do script gerado (CREATE + regra DROP) ---
{
  cat <<'HDR'
#!/usr/bin/env bash
# Gerado por gerar-escaping-ips.sh — aplique como root.
# Idempotente o bastante para reexecução parcial (ipset -exist).
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Execute como root: sudo $0" >&2
  exit 1
fi

echo "[*] Criando/garantindo escaping_ips..."
ipset create escaping_ips hash:ip maxelem 100000 -exist

# Evita duplicar a regra INPUT a cada reexecução
if ! iptables -C INPUT -m set --match-set escaping_ips src -j DROP 2>/dev/null; then
  iptables -I INPUT -m set --match-set escaping_ips src -j DROP
  echo "[+] Regra iptables INPUT/escaping_ips inserida"
else
  echo "[=] Regra iptables INPUT/escaping_ips já existia"
fi

HDR
} > "$OUT_SCRIPT"

escaped_count=0

echo "[*] Fase 1: IPs de países com set dedicado que 'escaparam'..."
while IFS='|' read -r ip code; do
  [[ -z "${ip:-}" || -z "${code:-}" ]] && continue
  set_name="$(country_to_set "$code")"
  [[ -z "$set_name" ]] && continue

  # Se o set nem existe, trata como escape (precisa cobrir)
  if ! ipset list "$set_name" >/dev/null 2>&1; then
    echo "ipset add escaping_ips $ip -exist  # $code - set $set_name ausente" >> "$OUT_SCRIPT"
    ((escaped_count++)) || true
    continue
  fi

  # ipset test retorna 0 se o IP ESTÁ no set
  if ! ipset test "$set_name" "$ip" >/dev/null 2>&1; then
    echo "ipset add escaping_ips $ip -exist  # $code - escapou de $set_name" >> "$OUT_SCRIPT"
    ((escaped_count++)) || true
  fi
done < <(sqlite3 -separator '|' "$DB_FILE" \
  "SELECT DISTINCT ip, country_code
   FROM ip_info
   WHERE country_code IN (${KNOWN_CODES_SQL})
     AND ip IS NOT NULL AND ip != '';")

echo "[+] Fase 1: $escaped_count IP(s) marcados para escaping_ips" | tee -a "$OUT_SCRIPT"
echo "" >> "$OUT_SCRIPT"
echo "# --- Fase 2: outros países (híbrido) ---" >> "$OUT_SCRIPT"

echo "[*] Fase 2: países fora da lista dedicada (exceto BR/US), total >= $MIN_OTHER..."
while IFS='|' read -r code name count; do
  [[ -z "${code:-}" ]] && continue
  code_l="${code,,}"
  set_name="${code_l}_block"

  echo "" >> "$OUT_SCRIPT"
  echo "# País $code ($name) — $count IP(s)" >> "$OUT_SCRIPT"

  if [[ "$count" -gt "$IPSET_THRESHOLD" ]]; then
    echo "echo \"[*] Criando set $set_name ($count IPs)...\"" >> "$OUT_SCRIPT"
    echo "ipset create $set_name hash:ip maxelem 100000 -exist" >> "$OUT_SCRIPT"

    while IFS= read -r ip; do
      [[ -z "$ip" ]] && continue
      echo "ipset add $set_name $ip -exist  # $code" >> "$OUT_SCRIPT"
    done < <(sqlite3 "$DB_FILE" \
      "SELECT DISTINCT ip FROM ip_info
       WHERE country_code = '$code' AND ip IS NOT NULL AND ip != '';")

    echo "if ! iptables -C INPUT -m set --match-set $set_name src -j DROP 2>/dev/null; then" >> "$OUT_SCRIPT"
    echo "  iptables -I INPUT -m set --match-set $set_name src -j DROP" >> "$OUT_SCRIPT"
    echo "fi" >> "$OUT_SCRIPT"
  else
    while IFS= read -r ip; do
      [[ -z "$ip" ]] && continue
      # Evita duplicar regra -s individual
      echo "if ! iptables -C INPUT -s $ip -j DROP 2>/dev/null; then" >> "$OUT_SCRIPT"
      echo "  iptables -I INPUT -s $ip -j DROP  # $code $name" >> "$OUT_SCRIPT"
      echo "fi" >> "$OUT_SCRIPT"
    done < <(sqlite3 "$DB_FILE" \
      "SELECT DISTINCT ip FROM ip_info
       WHERE country_code = '$code' AND ip IS NOT NULL AND ip != '';")
  fi
done < <(sqlite3 -separator '|' "$DB_FILE" \
  "SELECT country_code, country_name, COUNT(*) AS total
   FROM ip_info
   WHERE country_code NOT IN (${EXCLUDE_OTHER_SQL})
     AND country_code IS NOT NULL AND country_code != ''
   GROUP BY country_code, country_name
   HAVING total >= ${MIN_OTHER}
   ORDER BY total DESC;")

{
  cat <<'FOOT'

echo "[OK] add_escaping_ips.sh concluído."
echo "Revise: iptables -L INPUT -n -v --line-numbers"
echo "Revise: ipset list -n"
FOOT
} >> "$OUT_SCRIPT"

chmod +x "$OUT_SCRIPT"

echo
echo "Script gerado: $OUT_SCRIPT"
echo "Revise o conteúdo e aplique com:"
echo "  sudo ./$OUT_SCRIPT"
echo
echo "ATENÇÃO: regras DROP em INPUT podem cortar SSH se o seu IP estiver no banco."
echo "Mantenha uma sessão root aberta e teste com 'iptables -C' antes em produção."
