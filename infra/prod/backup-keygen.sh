#!/usr/bin/env bash
# Crée la paire de clés des SAUVEGARDES (une seule fois, idempotent) :
#  - la clé PUBLIQUE reste sur le serveur (~/.config/awform/backup-public.asc) : backup.sh chiffre avec elle ;
#  - la clé PRIVÉE est écrite dans ~/.config/awform/A-EMPORTER-backup-private.asc (600) et DOIT quitter la
#    machine : depuis le PC, infra/pc/recuperer-cle-sauvegarde.ps1 la copie dans le dossier désigné puis
#    l'efface du serveur (status.sh signale tant qu'elle est là). Plus tard : coffre de secrets du client.
# Sans la clé privée, aucune sauvegarde n'est lisible : en garder DEUX copies hors ligne.
set -euo pipefail
CONF="$HOME/.config/awform"
PUB="$CONF/backup-public.asc"
OUT="$CONF/A-EMPORTER-backup-private.asc"
umask 077
mkdir -p "$CONF"
if [ -s "$PUB" ]; then
  echo "clé publique déjà présente : $PUB (rien à faire)"
  exit 0
fi
GH="$(mktemp -d)"
trap 'rm -rf "$GH"' EXIT
gpg --homedir "$GH" --batch --quiet --passphrase '' \
  --quick-generate-key "AWFORM sauvegardes <sauvegardes@awform.invalid>" ed25519 cert 0
FPR="$(gpg --homedir "$GH" --batch --with-colons --list-keys | awk -F: '/^fpr:/ {print $10; exit}')"
gpg --homedir "$GH" --batch --quiet --passphrase '' --quick-add-key "$FPR" cv25519 encr 0
gpg --homedir "$GH" --batch --armor --export "$FPR" > "$PUB"
gpg --homedir "$GH" --batch --armor --pinentry-mode loopback --passphrase '' --export-secret-keys "$FPR" > "$OUT"
chmod 600 "$PUB" "$OUT"
echo "clé publique : $PUB"
echo "clé PRIVÉE À EMPORTER : $OUT (sha256 $(sha256sum "$OUT" | cut -c1-16))"
