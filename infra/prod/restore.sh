#!/usr/bin/env bash
# RESTAURATION COMPLÈTE (perte ou corruption de la base en service) : remplace la base « awform » par une
# sauvegarde chiffrée. DESTRUCTIF : la base actuelle est supprimée. Pour un simple contrôle sans risque, utiliser
# restore-test.sh (base temporaire).
#   … | infra/prod/restore.sh --je-remplace-la-base [fichier.dump.gpg]
# La clé PRIVÉE des sauvegardes arrive par l'ENTRÉE STANDARD (jamais écrite sur le disque du serveur) :
# depuis le PC, même mécanisme que infra/pc/test-restauration.ps1. Étapes : empreinte vérifiée, déchiffrement
# en mémoire (tmpfs), API/travailleur/web arrêtés, base supprimée et recréée, pg_restore, services relancés,
# santé contrôlée. Les comptes PostgreSQL (api, travailleur) existent au niveau du serveur : leurs droits sont
# restaurés avec la base. Journal : ~/awform-backups/backup.log.
set -euo pipefail
[ "${1:-}" = "--je-remplace-la-base" ] || {
  echo "restauration DESTRUCTIVE : relancer avec --je-remplace-la-base (voir EXPLOITATION.md)"
  exit 2
}
shift
PROD="$(cd "$(dirname "$0")" && pwd)"
CONF="$HOME/.config/awform"
DEST="${AWFORM_BACKUP_DIR:-$HOME/awform-backups}"
export AWFORM_ENV_DIR="${AWFORM_ENV_DIR:-$CONF}"
DC=(docker compose -f "$PROD/compose.yml")
FILE="${1:-$(ls -1t "$DEST"/awform-*.dump.gpg | head -1)}"
LOG="$DEST/backup.log"
[ -f "$FILE" ] || { echo "aucune sauvegarde"; exit 1; }
[ -t 0 ] && { echo "clé privée attendue sur l'entrée standard"; exit 2; }
sha256sum -c "$FILE.sha256" >/dev/null || { echo "ÉCHEC : empreinte de la sauvegarde"; exit 1; }
BASE=/dev/shm
[ -d "$BASE" ] || BASE="${TMPDIR:-/tmp}"
GH="$(mktemp -d "$BASE/rst.XXXXXX")"
trap 'rm -rf "$GH"' EXIT
gpg --homedir "$GH" --batch --quiet --import
gpg --homedir "$GH" --batch --quiet --pinentry-mode loopback --passphrase '' --decrypt -o "$GH/dump" "$FILE"
psql() { "${DC[@]}" exec -T db psql -U awform -v ON_ERROR_STOP=1 -qtA "$@"; }
echo "$(date -Iseconds) restauration COMPLÈTE commencée $(basename "$FILE")" >> "$LOG"
# plus aucune écriture pendant la restauration
"${DC[@]}" stop api worker web >/dev/null
psql -d postgres -c "DROP DATABASE IF EXISTS awform WITH (FORCE)"
psql -d postgres -c "CREATE DATABASE awform OWNER awform"
"${DC[@]}" exec -T db pg_restore -U awform -d awform --exit-on-error < "$GH/dump"
"${DC[@]}" up -d api worker web >/dev/null
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1/api/v1/health" 2>/dev/null | grep -q '"status":"ok"'; then break; fi
  [ "$i" = 60 ] && { echo "$(date -Iseconds) restauration ÉCHEC (santé)" >> "$LOG"; echo "ÉCHEC : santé"; exit 1; }
  sleep 2
done
echo "$(date -Iseconds) restauration COMPLÈTE ok $(basename "$FILE")" >> "$LOG"
echo "restauration : ok ($(basename "$FILE"))"
