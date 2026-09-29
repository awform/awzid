#!/usr/bin/env bash
# Réglages de DÉMONSTRATION dans prod.env (appelé par deploy.sh) :
#   infra/prod/demo-env.sh <prod.env> 1   → tuteur et paiement SIMULÉS, langues en préparation visibles
#   infra/prod/demo-env.sh <prod.env> 0   → ces trois réglages de démonstration sont RETIRÉS (audit INF-9) :
#     un déploiement normal après une démonstration ne garde jamais le paiement simulé (abonnement gratuit
#     pour tous) ni le tuteur simulé. Un réglage réel (ex. AWFORM_PAIEMENT=stripe) n'est jamais touché.
set -euo pipefail
ENVF="$1"
DEMO="$2"
DEMO_KEYS=(AWFORM_TUTEUR=simule AWFORM_PAIEMENT=simule AWFORM_LANGUES_PREPARATION=on)
for kv in "${DEMO_KEYS[@]}"; do
  k="${kv%%=*}"
  if [ "$DEMO" = 1 ]; then
    grep -q "^$k=" "$ENVF" || echo "$kv" >> "$ENVF"
  elif grep -qx "$kv" "$ENVF"; then
    sed -i "/^$kv\$/d" "$ENVF"
    echo "réglage de démonstration retiré : $kv"
  fi
done
