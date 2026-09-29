#!/usr/bin/env bash
# Supervision minimale : conteneurs, santé, dernière sauvegarde, battement du travailleur, disque, erreurs.
#   infra/prod/status.sh        (code de sortie 1 si quelque chose ne va pas : utilisable par une sonde)
set -uo pipefail
PROD="$(cd "$(dirname "$0")" && pwd)"
CONF="$HOME/.config/awform"
DEST="${AWFORM_BACKUP_DIR:-$HOME/awform-backups}"
export AWFORM_ENV_DIR="${AWFORM_ENV_DIR:-$CONF}"
DC=(docker compose -f "$PROD/compose.yml")
BAD=0
warn() { echo "ALERTE : $*"; BAD=1; }

echo "== conteneurs"
"${DC[@]}" ps --format 'table {{.Service}}\t{{.State}}\t{{.Health}}'
for s in db api worker web caddy; do
  st="$("${DC[@]}" ps --format '{{.Service}} {{.State}}' | awk -v s="$s" '$1==s{print $2}')"
  [ "$st" = running ] || warn "service $s : ${st:-absent}"
done

echo "== santé"
H="$(curl -fsS --max-time 5 http://127.0.0.1/api/v1/health 2>/dev/null)" || warn "API injoignable"
echo "${H:-}"
echo "${H:-}" | grep -q '"status":"ok"' || warn "santé dégradée"

echo "== sauvegarde"
# lue dans le journal : dernière réussite, dernier échec, copie hors site, restauration testée (INF-7, INF-8)
"$PROD/backup-status.sh" "$DEST" || BAD=1
[ -s "$CONF/backup-public.asc" ] || warn "clé publique des sauvegardes absente (backup-keygen.sh)"
# la clé PRIVÉE ne doit jamais rester sur le serveur (infra/pc/recuperer-cle-sauvegarde.ps1)
[ -e "$CONF/A-EMPORTER-backup-private.asc" ] && warn "clé PRIVÉE des sauvegardes encore sur le serveur : l'emporter"
[ -e "$CONF/backup.key" ] && warn "ancienne clé symétrique encore sur le serveur : l'emporter"

echo "== secrets (périmètre par service)"
"$PROD/env-check.sh" "$CONF/prod.env" | tail -1 || warn "un secret sort de son périmètre (env-check.sh)"

echo "== travailleur (pg-boss)"
if "${DC[@]}" logs --since 15m worker 2>/dev/null | grep -q battement; then echo "battement : ok"; else warn "pas de battement depuis 15 min"; fi

echo "== disque"
df -h / | tail -1
USE="$(df --output=pcent / | tail -1 | tr -dc 0-9)"
[ "$USE" -lt 85 ] || warn "disque plein à ${USE} %"

echo "== erreurs récentes (1 h)"
"${DC[@]}" logs --since 1h api worker 2>/dev/null | grep -iE '"level":(50|60)|error' | tail -5 || true
exit "$BAD"
