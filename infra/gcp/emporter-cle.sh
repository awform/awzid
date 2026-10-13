#!/usr/bin/env bash
# (VM de dev) emporte la clé PRIVÉE des sauvegardes du serveur de bêta hors du serveur : copie dans
# ~/.config/awform/awzid-beta/ (700/600) de la VM de dev, contrôle d'empreinte, puis effacement sur le serveur.
# Jamais affichée. Le client en fait ensuite DEUX copies hors ligne (PC, coffre).
set -euo pipefail
S=~/awform-gcp/infra/gcp/serveur.sh
D=~/.config/awform/awzid-beta
umask 077
mkdir -p "$D"; chmod 700 "$D"
SRC='~/.config/awform/A-EMPORTER-backup-private.asc'
$S recevoir "$SRC" "$D/backup-private.asc" >/dev/null 2>&1
chmod 600 "$D/backup-private.asc"
L="$(sha256sum "$D/backup-private.asc" | cut -c1-64)"
R="$($S ssh "sha256sum $SRC" 2>/dev/null | cut -c1-64)"
if [ -n "$L" ] && [ "$L" = "$R" ]; then
  $S ssh "shred -u $SRC && echo effacée du serveur" 2>/dev/null
  echo "clé privée : $D/backup-private.asc (empreinte ${L:0:16}…, identique)"
else
  echo "ÉCHEC : empreintes différentes, clé laissée sur le serveur"; exit 1
fi
