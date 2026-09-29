#!/usr/bin/env bash
# Contrôle sur la machine : aucun conteneur ne reçoit un SECRET de prod.env hors de son périmètre
# (infra/prod/env-scopes.conf). Secret = variable dont le nom contient SECRET, KEY, PASSWORD, TOKEN
# ou DATABASE_URL. Lit seulement les NOMS des variables (jamais les valeurs).
#   env-check.sh [prod.env]   → code 0 si tout est conforme, 1 sinon
set -euo pipefail
PROD="$(cd "$(dirname "$0")" && pwd)"
CONF="$HOME/.config/awform"
ENVF="${1:-$CONF/prod.env}"
export AWFORM_ENV_DIR="${AWFORM_ENV_DIR:-$CONF}"
DC=(docker compose -f "$PROD/compose.yml")
scope() { awk -v s="$1:" '$1 == s { $1 = ""; print }' "$PROD/env-scopes.conf" | tr ' ' '\n' | sed 's/=.*//' | tr '\n' ' '; }
secrets="$(grep -oE '^[A-Z_][A-Z0-9_]*' "$ENVF" | grep -E 'SECRET|KEY|PASSWORD|TOKEN|DATABASE_URL' || true)"
bad=0
for svc in db api worker web caddy; do
  id="$("${DC[@]}" ps -q "$svc" 2>/dev/null || true)"
  [ -z "$id" ] && continue
  names="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$id" | cut -d= -f1)"
  allowed=" $(scope "$svc") "
  for k in $secrets; do
    if grep -qx "$k" <<< "$names" && [[ "$allowed" != *" $k "* ]]; then
      echo "FUITE : le service $svc reçoit $k (hors de son périmètre)"
      bad=1
    fi
  done
  echo "$svc : $(grep -cxF -f <(tr ' ' '\n' <<< "$secrets" | sed '/^$/d') <<< "$names" || true) secret(s) reçu(s)"
done
[ "$bad" = 0 ] && echo "périmètres des secrets : conformes" || { echo "périmètres des secrets : NON CONFORMES"; exit 1; }
