#!/usr/bin/env bash
# Découpe prod.env (source unique des secrets, jamais montée dans un conteneur) en un fichier par
# service, selon infra/prod/env-scopes.conf :  env-split.sh <prod.env> <dossier de sortie>
# Chaque <service>.env ne contient QUE les variables de son périmètre (droits 600, écriture atomique) ;
# « VAR=SOURCE » : VAR reçoit la valeur de SOURCE (compte PostgreSQL propre à chaque service).
set -euo pipefail
set -f
SRC="$1"
OUT="$2"
SCOPES="$(dirname "$0")/env-scopes.conf"
[ -f "$SRC" ] || { echo "env-split : $SRC introuvable" >&2; exit 1; }
umask 077
mkdir -p "$OUT"
while read -r svc vars; do
  case "$svc" in '' | \#*) continue ;; esac
  svc="${svc%:}"
  tmp="$(mktemp "$OUT/.$svc.env.XXXXXX")"
  for v in $vars; do
    name="${v%%=*}"
    from="${v#*=}"
    grep -E "^${from}=" "$SRC" | sed "s/^${from}=/${name}=/" >> "$tmp" || true
  done
  chmod 600 "$tmp"
  mv -f "$tmp" "$OUT/$svc.env"
done < "$SCOPES"
