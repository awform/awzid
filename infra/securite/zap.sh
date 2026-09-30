#!/usr/bin/env bash
# Scan OWASP ZAP « baseline » (passif : rien n'est attaqué ni modifié) d'une instance LOCALE ou de TEST
# (jamais la production sans l'accord écrit du client) :
#   infra/securite/zap.sh http://localhost            # site servi par Caddy (instance Docker Compose)
#   infra/securite/zap.sh https://127.0.0.2 --ajax     # HTTPS (autorité locale de Caddy), araignée AJAX
# Rapports : ./zap-rapport/ (JSON, Markdown). Code de sortie non nul si une règle hors zap-regles.tsv est
# levée (avertissement ou échec). Image : zaproxy/zap-stable (Docker Hub).
set -euo pipefail
URL="${1:?adresse à scanner}"
shift
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${ZAP_OUT:-$PWD/zap-rapport}"
mkdir -p "$OUT"
cp "$DIR/zap-regles.tsv" "$OUT/zap-regles.tsv"
chmod 777 "$OUT"
EXTRA=()
[ "${1:-}" = "--ajax" ] && EXTRA+=(-j)
docker run --rm --network host -v "$OUT:/zap/wrk:rw" zaproxy/zap-stable \
  zap-baseline.py -t "$URL" -m 3 -c zap-regles.tsv -J zap.json -w zap.md "${EXTRA[@]}"
