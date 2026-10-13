#!/usr/bin/env bash
# Test de restauration RÉEL depuis Cloud Storage (sur le serveur de bêta) : télécharge la dernière sauvegarde
# du bucket (ou celle donnée), vérifie son empreinte, puis infra/prod/restore-test.sh la restaure dans une base
# TEMPORAIRE et compare les tables principales avec la base en service (la base en service n'est jamais modifiée).
# La clé PRIVÉE des sauvegardes arrive par l'ENTRÉE STANDARD (elle n'est pas sur le serveur) :
#   infra/gcp/serveur.sh ssh 'bash ~/awform-app/infra/gcp/restauration-gcs.sh' < cle-privee.asc
set -euo pipefail
GCP="$(cd "$(dirname "$0")" && pwd)"
. "$GCP/config.sh"
[ -t 0 ] && { echo "clé privée attendue sur l'entrée standard"; exit 2; }
OBJ="${1:-$(gcloud storage ls "gs://$BUCKET/awform/awform-*.dump.gpg" | sort | tail -1)}"
[ -n "$OBJ" ] || { echo "aucune sauvegarde dans gs://$BUCKET/awform"; exit 1; }
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
gcloud storage cp --quiet "$OBJ" "$OBJ.sha256" "$T/" >/dev/null
# l'empreinte contient le chemin local d'origine : on compare la seule valeur
F="$T/$(basename "$OBJ")"
[ "$(sha256sum "$F" | cut -d' ' -f1)" = "$(cut -d' ' -f1 "$F.sha256")" ] || { echo "ÉCHEC : empreinte"; exit 1; }
sha256sum "$F" > "$F.sha256"
echo "sauvegarde du bucket : $OBJ ($(stat -c %s "$F") octets, empreinte ok)"
AWFORM_BACKUP_DIR="$T" "$GCP/../prod/restore-test.sh" "$F"
mkdir -p "$HOME/awform-backups"
echo "$(date -Iseconds) restauration testée ok depuis Cloud Storage $(basename "$OBJ")" >> "$HOME/awform-backups/backup.log"
