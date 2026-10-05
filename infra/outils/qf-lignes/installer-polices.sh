#!/usr/bin/env bash
# A34 — installe les polices « par page » du Complexe du Roi Fahd (Muṣḥaf de Médine numérique, édition 1405 :
# QCF_P001…QCF_P604 + QCF_BSML) dans le dossier servi par l'API (AWFORM_QCF_DIR), TELLES QUELLES :
# aucun sous-ensemble, aucune conversion (licence intégrée aux polices et conditions du Complexe, LICENCES.md).
# Seul le NOM du fichier est uniformisé (QCF_P006.TTF → QCF_P006.ttf) ; le contenu est copié octet pour octet.
#
# usage : infra/outils/qf-lignes/installer-polices.sh <Data.zip du Complexe> <dossier cible>
# Le fichier d'origine (qurancomplex.gov.sa/Downloads/Fonts/Data.zip, capture Wayback) n'entre pas dans le dépôt.
set -euo pipefail
ZIP="${1:?archive Data.zip du Complexe}"
DEST="${2:?dossier cible (AWFORM_QCF_DIR)}"
ATTENDU=7fe7a8719695c4dfb614cf7fb16af9d197729ae94bff347c30f804ac2fc7edb8
VU=$(sha256sum "$ZIP" | cut -d' ' -f1)
if [ "$VU" != "$ATTENDU" ]; then
  echo "REFUS : empreinte de l'archive $VU ≠ $ATTENDU (SOURCES_MUSHAF.md § 1)" >&2
  exit 1
fi
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
unzip -q -j "$ZIP" 'Data/Fonts/QCF_*' -d "$TMP"
mkdir -p "$DEST"
n=0
for f in "$TMP"/*; do
  b=$(basename "$f")
  up=$(echo "$b" | tr '[:lower:]' '[:upper:]')
  case "$up" in
    QCF_P[0-9][0-9][0-9].TTF | QCF_BSML.TTF) ;;
    *) echo "ignoré : $b"; continue ;;
  esac
  cp "$f" "$DEST/${up%.TTF}.ttf"
  n=$((n + 1))
done
if [ "$n" -ne 605 ]; then
  echo "REFUS : $n polices trouvées (attendu : 604 pages + QCF_BSML)" >&2
  exit 1
fi
for p in $(seq -f '%03g' 1 604); do
  [ -f "$DEST/QCF_P$p.ttf" ] || { echo "REFUS : QCF_P$p.ttf manquante" >&2; exit 1; }
done
(cd "$DEST" && sha256sum QCF_*.ttf > SHA256SUMS)
brut=$(cat "$DEST"/QCF_*.ttf | wc -c)
gz=0
for f in "$DEST"/QCF_*.ttf; do gz=$((gz + $(gzip -9 -c "$f" | wc -c))); done
echo "installé : $n polices dans $DEST — $brut octets bruts, $gz octets transférés (gzip -9 ; Caddy compresse à l'envoi)"
