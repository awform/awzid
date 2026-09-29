#!/usr/bin/env bash
# Sauvegarde CHIFFRÉE de la base (lancée chaque nuit par awform-backup.timer, ou à la main).
#  - pg_dump (format personnalisé) depuis le conteneur, chiffrement symétrique GnuPG AES-256 (avec contrôle
#    d'intégrité) ; la clé est générée UNE fois dans ~/.config/awform/backup.key (600) et n'est jamais
#    stockée avec les sauvegardes : la conserver aussi ailleurs (coffre du client), sinon rien n'est lisible ;
#  - empreinte SHA-256, rotation (14 dernières), journal ~/awform-backups/backup.log.
# Copie HORS de la machine : à brancher quand le client aura un stockage (voir EXPLOITATION.md).
set -euo pipefail
PROD="$(cd "$(dirname "$0")" && pwd)"
CONF="$HOME/.config/awform"
DEST="${AWFORM_BACKUP_DIR:-$HOME/awform-backups}"
KEY="$CONF/backup.key"
KEEP="${AWFORM_BACKUP_KEEP:-14}"
export AWFORM_ENV_FILE="${AWFORM_ENV_FILE:-$CONF/prod.env}"
umask 077
mkdir -p "$DEST"
[ -f "$KEY" ] || openssl rand -base64 48 > "$KEY"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DEST/awform-$STAMP.dump.gpg"
docker compose -f "$PROD/compose.yml" exec -T db pg_dump -U awform -d awform -Fc \
  | gpg --batch --yes --quiet --symmetric --cipher-algo AES256 --passphrase-file "$KEY" -o "$FILE"
[ -s "$FILE" ] || { echo "$(date -Iseconds) ÉCHEC sauvegarde vide" >> "$DEST/backup.log"; exit 1; }
sha256sum "$FILE" > "$FILE.sha256"
ls -1t "$DEST"/awform-*.dump.gpg | tail -n +"$((KEEP + 1))" | while read -r old; do rm -f "$old" "$old.sha256"; done
echo "$(date -Iseconds) ok $(basename "$FILE") $(stat -c %s "$FILE") octets" >> "$DEST/backup.log"
echo "$FILE"
