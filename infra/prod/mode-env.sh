#!/usr/bin/env bash
# Mode d'exposition dans prod.env (appelé par deploy.sh ; audit SEC-7) :
#   infra/prod/mode-env.sh <prod.env> 1   → PRODUCTION (domaine public) : HTTP redirigé vers HTTPS (308),
#                                           cookie de session toujours « Secure », certificat Let's Encrypt
#                                           (AWFORM_TLS=tls_public), bêta FERMÉE SUR INVITATION (AWFORM_ACCES=invitation,
#                                           posé une seule fois : ensuite, le réglage se change dans l'espace
#                                           administrateur, sans redéploiement), adresse publique des e-mails
#   infra/prod/mode-env.sh <prod.env> 0   → réseau local / démonstration : HTTP servi (adresse IP sans
#                                           certificat public), cookie « Secure » seulement en HTTPS (auto),
#                                           autorité de certification interne de Caddy
# http://localhost (tunnel ssh) reste toujours servi : c'est un contexte sécurisé pour le navigateur.
set -euo pipefail
ENVF="$1"
PRODUCTION="$2"
sed -i '/^COOKIE_SECURE=/d;/^AWFORM_HTTP=/d;/^AWFORM_TLS=/d' "$ENVF"
if [ "$PRODUCTION" = 1 ]; then
  echo "COOKIE_SECURE=1" >> "$ENVF"
  echo "AWFORM_HTTP=rediriger" >> "$ENVF"
  echo "AWFORM_TLS=tls_public" >> "$ENVF"
  # bêta fermée : par défaut, personne ne s'inscrit sans invitation (défaut de l'environnement ; l'administrateur
  # peut le changer ensuite dans l'application)
  grep -q '^AWFORM_ACCES=' "$ENVF" || echo "AWFORM_ACCES=invitation" >> "$ENVF"
  # adresse e-mail vérifiée avant activation (si l'envoi d'e-mails est réglé) et protection anti-robots de l'inscription
  grep -q '^AWFORM_VERIFICATION=' "$ENVF" || echo "AWFORM_VERIFICATION=requise" >> "$ENVF"
  grep -q '^AWFORM_ANTIBOT=' "$ENVF" || echo "AWFORM_ANTIBOT=on" >> "$ENVF"
  SITE_NAME="$(grep -E '^SITE=' "$ENVF" | head -1 | cut -d= -f2-)"
  if [ -n "$SITE_NAME" ] && ! grep -q '^AWFORM_PUBLIC_URL=' "$ENVF"; then
    echo "AWFORM_PUBLIC_URL=https://$SITE_NAME" >> "$ENVF"
  fi
else
  echo "COOKIE_SECURE=auto" >> "$ENVF"
  echo "AWFORM_HTTP=servir" >> "$ENVF"
fi
