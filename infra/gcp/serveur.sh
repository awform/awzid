#!/usr/bin/env bash
# Accès au serveur de bêta par IAP (aucun port 22 public) :
#   infra/gcp/serveur.sh ssh ['commande']          shell ou commande distante
#   infra/gcp/serveur.sh envoyer <local>... <dest>  copie vers le serveur (gcloud compute scp)
#   infra/gcp/serveur.sh recevoir <distant> <local> copie depuis le serveur
#   infra/gcp/serveur.sh tunnel [port-local]       http://localhost:<port> (défaut 8080) -> Caddy du serveur
set -euo pipefail
. "$(dirname "$0")/config.sh"
OPTS=(--zone "$ZONE" --tunnel-through-iap)
case "${1:-ssh}" in
  ssh) shift || true; if [ $# -gt 0 ]; then gc compute ssh "$VM" "${OPTS[@]}" --command "$*"; else gc compute ssh "$VM" "${OPTS[@]}"; fi ;;
  envoyer) shift; dest="${*: -1}"; set -- "${@:1:$(($# - 1))}"; gc compute scp "${OPTS[@]}" --recurse "$@" "$VM:$dest" ;;
  recevoir) gc compute scp "${OPTS[@]}" "$VM:$2" "$3" ;;
  tunnel) P="${2:-8080}"; echo "http://localhost:$P (Ctrl+C pour fermer)"; gc compute ssh "$VM" "${OPTS[@]}" -- -N -L "$P:127.0.0.1:80" ;;
  *) echo "usage : $0 ssh|envoyer|recevoir|tunnel"; exit 2 ;;
esac
