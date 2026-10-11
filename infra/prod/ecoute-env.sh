#!/usr/bin/env bash
# A5 : interrupteur d'EXPLOITATION du service d'écoute de la récitation (appelé par deploy.sh) :
#   infra/prod/ecoute-env.sh <prod.env> <demo 0|1>   → affiche « 1 » si le profil Docker « ecoute » doit être démarré
# Interrupteur : AWFORM_ECOUTE=1 dans prod.env (ou dans l'environnement de deploy.sh). Absent ou autre : RIEN
# n'est démarré ni modifié (production par défaut : service non démarré, fonction fermée).
# AWFORM_ECOUTE=1 ajoute (sans écraser un réglage existant) AWFORM_ECOUTE_URL=http://ecoute:8000 ; en
# démonstration seulement, AWFORM_ECOUTE_IA=on (en production, la fonction reste fermée : l'ouvrir à la main,
# EXPLOITATION § 11, point 4).
set -euo pipefail
ENVF="$1"
DEMO="${2:-0}"
VAL="${AWFORM_ECOUTE:-$(grep -E '^AWFORM_ECOUTE=' "$ENVF" 2>/dev/null | tail -1 | cut -d= -f2- || true)}"
if [ "$VAL" != 1 ]; then echo 0; exit 0; fi
grep -q '^AWFORM_ECOUTE_URL=' "$ENVF" || echo 'AWFORM_ECOUTE_URL=http://ecoute:8000' >> "$ENVF"
if [ "$DEMO" = 1 ]; then grep -q '^AWFORM_ECOUTE_IA=' "$ENVF" || echo 'AWFORM_ECOUTE_IA=on' >> "$ENVF"; fi
echo 1
