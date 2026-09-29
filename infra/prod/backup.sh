#!/usr/bin/env bash
# Sauvegarde CHIFFRÉE de la base (lancée chaque nuit par awform-backup.timer, ou à la main).
#  - pg_dump (format personnalisé) depuis le conteneur, chiffré à CLÉ PUBLIQUE (GnuPG) : le serveur ne garde
#    QUE la clé publique (~/.config/awform/backup-public.asc) ; il peut chiffrer, jamais déchiffrer. La clé
#    PRIVÉE est hors de la machine (PC du client, puis coffre de secrets) : voir infra/prod/backup-keygen.sh
#    et EXPLOITATION.md § 4 ;
#  - empreinte SHA-256, rotation (14 dernières), journal ~/awform-backups/backup.log.
# Copie HORS de la machine : à brancher quand le client aura un stockage (voir EXPLOITATION.md).
set -euo pipefail
PROD="$(cd "$(dirname "$0")" && pwd)"
CONF="$HOME/.config/awform"
DEST="${AWFORM_BACKUP_DIR:-$HOME/awform-backups}"
PUB="$CONF/backup-public.asc"
KEEP="${AWFORM_BACKUP_KEEP:-14}"
export AWFORM_ENV_FILE="${AWFORM_ENV_FILE:-$CONF/prod.env}" AWFORM_DB_ENV_FILE="${AWFORM_DB_ENV_FILE:-$CONF/db.env}" AWFORM_CADDY_ENV_FILE="${AWFORM_CADDY_ENV_FILE:-$CONF/caddy.env}"
umask 077
mkdir -p "$DEST"
[ -s "$PUB" ] || { echo "$(date -Iseconds) ÉCHEC : clé publique absente ($PUB) — lancer backup-keygen.sh" | tee -a "$DEST/backup.log"; exit 1; }
# trousseau jetable contenant SEULEMENT la clé publique
GH="$(mktemp -d)"
trap 'rm -rf "$GH"' EXIT
gpg --homedir "$GH" --batch --quiet --import "$PUB"
FPR="$(gpg --homedir "$GH" --batch --with-colons --list-keys | awk -F: '/^fpr:/ {print $10; exit}')"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DEST/awform-$STAMP.dump.gpg"
docker compose -f "$PROD/compose.yml" exec -T db pg_dump -U awform -d awform -Fc \
  | gpg --homedir "$GH" --batch --yes --quiet --trust-model always --encrypt --recipient "$FPR" -o "$FILE"
[ -s "$FILE" ] || { echo "$(date -Iseconds) ÉCHEC sauvegarde vide" >> "$DEST/backup.log"; exit 1; }
sha256sum "$FILE" > "$FILE.sha256"
ls -1t "$DEST"/awform-*.dump.gpg | tail -n +"$((KEEP + 1))" | while read -r old; do rm -f "$old" "$old.sha256"; done
echo "$(date -Iseconds) ok $(basename "$FILE") $(stat -c %s "$FILE") octets (clé publique ${FPR: -16})" >> "$DEST/backup.log"
echo "$FILE"
