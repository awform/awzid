#!/usr/bin/env bash
# Sauvegarde CHIFFRÉE de la base (lancée chaque nuit par awform-backup.timer, ou à la main).
#  - pg_dump (format personnalisé) depuis le conteneur, chiffré à CLÉ PUBLIQUE (GnuPG) : le serveur ne garde
#    QUE la clé publique (~/.config/awform/backup-public.asc) ; il peut chiffrer, jamais déchiffrer. La clé
#    PRIVÉE est hors de la machine (PC du client, puis coffre de secrets) : voir infra/prod/backup-keygen.sh
#    et EXPLOITATION.md § 4 ;
#  - empreinte SHA-256, rotation (14 dernières), journal ~/awform-backups/backup.log ;
#  - écriture dans un fichier « .part » renommé SEULEMENT en cas de succès : un pg_dump en échec ne laisse
#    aucune sauvegarde partielle et journalise « ÉCHEC » (audit INF-7) ;
#  - copie HORS de la machine (audit INF-8) si AWFORM_BACKUP_HORS_SITE est réglé (destination rsync : dossier
#    monté ou « utilisateur@hôte:dossier ») ; journalisée « hors-site ok » ou « hors-site ÉCHEC ». Stockage à
#    choisir par le client (DECISIONS_EN_ATTENTE D10).
set -euo pipefail
PROD="$(cd "$(dirname "$0")" && pwd)"
CONF="$HOME/.config/awform"
DEST="${AWFORM_BACKUP_DIR:-$HOME/awform-backups}"
PUB="$CONF/backup-public.asc"
KEEP="${AWFORM_BACKUP_KEEP:-14}"
export AWFORM_ENV_DIR="${AWFORM_ENV_DIR:-$CONF}"
umask 077
mkdir -p "$DEST"
LOG="$DEST/backup.log"
[ -s "$PUB" ] || { echo "$(date -Iseconds) ÉCHEC : clé publique absente ($PUB) — lancer backup-keygen.sh" | tee -a "$LOG"; exit 1; }
# trousseau jetable contenant SEULEMENT la clé publique
GH="$(mktemp -d)"
PART=""
trap 'rm -rf "$GH"; [ -z "$PART" ] || rm -f "$PART"' EXIT
trap 'echo "$(date -Iseconds) ÉCHEC sauvegarde (ligne $LINENO)" >> "$LOG"' ERR
gpg --homedir "$GH" --batch --quiet --import "$PUB"
FPR="$(gpg --homedir "$GH" --batch --with-colons --list-keys | awk -F: '/^fpr:/ {print $10; exit}')"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DEST/awform-$STAMP.dump.gpg"
PART="$FILE.part"
docker compose -f "$PROD/compose.yml" exec -T db pg_dump -U awform -d awform -Fc \
  | gpg --homedir "$GH" --batch --yes --quiet --trust-model always --encrypt --recipient "$FPR" -o "$PART"
[ -s "$PART" ] || { echo "$(date -Iseconds) ÉCHEC sauvegarde vide" >> "$LOG"; exit 1; }
mv "$PART" "$FILE"
PART=""
sha256sum "$FILE" > "$FILE.sha256"
ls -1t "$DEST"/awform-*.dump.gpg | tail -n +"$((KEEP + 1))" | while read -r old; do rm -f "$old" "$old.sha256"; done
echo "$(date -Iseconds) ok $(basename "$FILE") $(stat -c %s "$FILE") octets (clé publique ${FPR: -16})" >> "$LOG"
if [ -n "${AWFORM_BACKUP_HORS_SITE:-}" ]; then
  # la sauvegarde locale est bonne : un échec de la copie est journalisé (backup-status.sh alerte)
  trap - ERR
  HS="$AWFORM_BACKUP_HORS_SITE"
  case "$HS" in
    *:*) copy() { rsync -a "$@" "$HS/"; } ;;          # autre machine (ssh)
    *) copy() { cp -p "$@" "$HS/"; } ;;              # dossier monté (disque externe, stockage réseau)
  esac
  if copy "$FILE" "$FILE.sha256"; then
    echo "$(date -Iseconds) hors-site ok $(basename "$FILE")" >> "$LOG"
  else
    echo "$(date -Iseconds) hors-site ÉCHEC $(basename "$FILE")" >> "$LOG"
  fi
fi
echo "$FILE"
