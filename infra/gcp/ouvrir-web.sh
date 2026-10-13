#!/usr/bin/env bash
# OUVERTURE PUBLIQUE du serveur de bêta (HTTP/HTTPS) — à lancer SEULEMENT le jour de la mise en ligne, sur
# décision du client, après la liste de contrôle (EXPLOITATION « Serveur de bêta Google Cloud », Ouverture) :
#   infra/gcp/ouvrir-web.sh --oui        active la règle awzid-allow-web (tcp:80,443 depuis Internet)
#   infra/gcp/ouvrir-web.sh --fermer     la désactive (retour à l'état privé, immédiat)
set -euo pipefail
. "$(dirname "$0")/config.sh"
case "${1:-}" in
  --oui) gc compute firewall-rules update awzid-allow-web --no-disabled; echo "OUVERT : 80/443 publics vers $VM" ;;
  --fermer) gc compute firewall-rules update awzid-allow-web --disabled; echo "FERMÉ : 80/443" ;;
  *) echo "usage : $0 --oui | --fermer   (rien n'a été changé)"; exit 2 ;;
esac
gc compute firewall-rules describe awzid-allow-web --format='value(name,disabled)'
