#!/usr/bin/env bash
# TEST DE RESTAURATION (à lancer au moins une fois par mois, et après chaque changement de sauvegarde) :
# déchiffre la dernière sauvegarde, la restaure dans une base TEMPORAIRE du même serveur, compare le
# nombre de lignes des tables principales avec la base en service, puis supprime la base temporaire.
# La base en service n'est jamais modifiée.
#   infra/prod/restore-test.sh [fichier.dump.gpg]
set -euo pipefail
PROD="$(cd "$(dirname "$0")" && pwd)"
CONF="$HOME/.config/awform"
DEST="${AWFORM_BACKUP_DIR:-$HOME/awform-backups}"
KEY="$CONF/backup.key"
export AWFORM_ENV_FILE="${AWFORM_ENV_FILE:-$CONF/prod.env}"
DC=(docker compose -f "$PROD/compose.yml")
FILE="${1:-$(ls -1t "$DEST"/awform-*.dump.gpg | head -1)}"
[ -f "$FILE" ] || { echo "aucune sauvegarde"; exit 1; }
sha256sum -c "$FILE.sha256" >/dev/null || { echo "ÉCHEC : empreinte de la sauvegarde"; exit 1; }
TMP=awform_restore_test
psql() { "${DC[@]}" exec -T db psql -U awform -v ON_ERROR_STOP=1 -qtA "$@"; }
psql -d awform -c "DROP DATABASE IF EXISTS $TMP" >/dev/null
psql -d awform -c "CREATE DATABASE $TMP" >/dev/null
trap 'psql -d awform -c "DROP DATABASE IF EXISTS '"$TMP"'" >/dev/null' EXIT
gpg --batch --quiet --decrypt --passphrase-file "$KEY" "$FILE" \
  | "${DC[@]}" exec -T db pg_restore -U awform -d "$TMP" --no-owner
STATUS=0
for tbl in account profile consent attempt hifz_event practice_event quran_verse unit_version edition; do
  live="$(psql -d awform -c "select count(*) from $tbl")"
  rest="$(psql -d "$TMP" -c "select count(*) from $tbl")"
  flag="ok"
  # la base en service peut avoir avancé depuis la sauvegarde : jamais MOINS dans la restauration pour les tables fixes
  if [ "$tbl" = quran_verse ] && [ "$rest" != 6236 ]; then flag="ÉCHEC"; STATUS=1; fi
  if [ "$rest" -gt "$live" ]; then flag="ÉCHEC"; STATUS=1; fi
  printf '%-16s en service %8s   restaurée %8s   %s\n' "$tbl" "$live" "$rest" "$flag"
done
LOG="$DEST/backup.log"
if [ "$STATUS" = 0 ]; then
  echo "$(date -Iseconds) restauration testée ok $(basename "$FILE")" >> "$LOG"
  echo "restauration : ok ($(basename "$FILE"))"
else
  echo "$(date -Iseconds) restauration ÉCHEC $(basename "$FILE")" >> "$LOG"
  echo "restauration : ÉCHEC"
fi
exit "$STATUS"
