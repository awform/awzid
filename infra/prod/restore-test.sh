#!/usr/bin/env bash
# TEST DE RESTAURATION (à lancer au moins une fois par mois, et après chaque changement de sauvegarde) :
# déchiffre la dernière sauvegarde, la restaure dans une base TEMPORAIRE du même serveur, compare le
# nombre de lignes des tables principales avec la base en service, puis supprime la base temporaire.
# La base en service n'est jamais modifiée.
# La clé PRIVÉE n'est pas sur le serveur : elle arrive par l'ENTRÉE STANDARD (depuis le PC :
# infra/pc/test-restauration.ps1), est importée dans un trousseau temporaire en mémoire, puis effacée.
#   … | infra/prod/restore-test.sh [fichier.dump.gpg]
# Anciennes sauvegardes à chiffrement symétrique : AWFORM_BACKUP_LEGACY=1 et la phrase de passe par
# l'entrée standard à la place de la clé.
set -euo pipefail
PROD="$(cd "$(dirname "$0")" && pwd)"
CONF="$HOME/.config/awform"
DEST="${AWFORM_BACKUP_DIR:-$HOME/awform-backups}"
export AWFORM_ENV_DIR="${AWFORM_ENV_DIR:-$CONF}"
DC=(docker compose -f "$PROD/compose.yml")
FILE="${1:-$(ls -1t "$DEST"/awform-*.dump.gpg | head -1)}"
[ -f "$FILE" ] || { echo "aucune sauvegarde"; exit 1; }
[ -t 0 ] && { echo "clé privée attendue sur l'entrée standard (voir infra/pc/test-restauration.ps1)"; exit 2; }
sha256sum -c "$FILE.sha256" >/dev/null || { echo "ÉCHEC : empreinte de la sauvegarde"; exit 1; }
# trousseau temporaire en mémoire (tmpfs) : la clé ne touche jamais le disque du serveur
BASE=/dev/shm
[ -d "$BASE" ] || BASE="${TMPDIR:-/tmp}"
GH="$(mktemp -d "$BASE/rst.XXXXXX")"
TMP=awform_restore_test
psql() { "${DC[@]}" exec -T db psql -U awform -v ON_ERROR_STOP=1 -qtA "$@"; }
cleanup() {
  rm -rf "$GH"
  psql -d awform -c "DROP DATABASE IF EXISTS $TMP" >/dev/null || true
}
trap cleanup EXIT
if [ "${AWFORM_BACKUP_LEGACY:-0}" = 1 ]; then
  cat > "$GH/pass"
  DECRYPT=(gpg --homedir "$GH" --batch --quiet --decrypt --passphrase-file "$GH/pass")
else
  gpg --homedir "$GH" --batch --quiet --import
  DECRYPT=(gpg --homedir "$GH" --batch --quiet --pinentry-mode loopback --passphrase '' --decrypt)
fi
# déchiffrement IMMÉDIAT, en mémoire (tmpfs), avant toute autre commande
"${DECRYPT[@]}" -o "$GH/dump" "$FILE"
psql -d awform -c "DROP DATABASE IF EXISTS $TMP" >/dev/null
psql -d awform -c "CREATE DATABASE $TMP" >/dev/null
"${DC[@]}" exec -T db pg_restore -U awform -d "$TMP" --no-owner < "$GH/dump"
STATUS=0
for tbl in account profile consent attempt hifz_event practice_event quran_verse unit_version edition; do
  live="$(psql -d awform -c "select count(*) from $tbl")"
  rest="$(psql -d "$TMP" -c "select count(*) from $tbl")"
  flag="ok"
  # la base en service peut avoir avancé depuis la sauvegarde : jamais PLUS dans la restauration
  if [ "$tbl" = quran_verse ] && [ "$rest" != 6236 ]; then flag="ÉCHEC"; STATUS=1; fi
  # seuils minimaux (audit INF-8) : une base vide ou sans contenu publié ne « réussit » pas
  case "$tbl" in edition | unit_version) [ "$rest" -ge 1 ] || { flag="ÉCHEC"; STATUS=1; } ;; esac
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
