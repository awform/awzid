#!/usr/bin/env bash
# Mode d'exposition dans prod.env (appelé par deploy.sh ; audit SEC-7) :
#   infra/prod/mode-env.sh <prod.env> 1   → PRODUCTION (domaine public) : HTTP redirigé vers HTTPS (308),
#                                           cookie de session toujours « Secure »
#   infra/prod/mode-env.sh <prod.env> 0   → réseau local / démonstration : HTTP servi (adresse IP sans
#                                           certificat public), cookie « Secure » seulement en HTTPS (auto)
# http://localhost (tunnel ssh) reste toujours servi : c'est un contexte sécurisé pour le navigateur.
set -euo pipefail
ENVF="$1"
PRODUCTION="$2"
sed -i '/^COOKIE_SECURE=/d;/^AWFORM_HTTP=/d' "$ENVF"
if [ "$PRODUCTION" = 1 ]; then
  echo "COOKIE_SECURE=1" >> "$ENVF"
  echo "AWFORM_HTTP=rediriger" >> "$ENVF"
else
  echo "COOKIE_SECURE=auto" >> "$ENVF"
  echo "AWFORM_HTTP=servir" >> "$ENVF"
fi
