#!/usr/bin/env bash
# Nettoyage Docker HEBDOMADAIRE (lot F5) : images inutilisées et cache de construction de plus de 7 jours.
# Ne touche JAMAIS : les conteneurs (en marche ou arrêtés), les images qu'ils utilisent, les VOLUMES (données de
# la base, sauvegardes, audio) ni les réseaux. Le retour arrière ne dépend pas des vieilles images : il reconstruit
# depuis l'étiquette git `avant-<lot>` (EXPLOITATION § 11) ; les images de la semaine sont gardées de toute façon.
#
#   infra/prod/nettoyage-docker.sh              nettoie maintenant (journal : ~/awform-backups/nettoyage-docker.log)
#   infra/prod/nettoyage-docker.sh --installer  copie le script dans ~/.local/bin et ajoute la tâche cron
#                                               (dimanche 04:23, heure du serveur) ; sans effet si elle existe déjà
#   infra/prod/nettoyage-docker.sh --essai      montre seulement ce qui serait gagné (rien n'est effacé)
set -euo pipefail

GARDE="${AWZID_NETTOYAGE_GARDE:-168h}"
LOG="${AWZID_NETTOYAGE_LOG:-$HOME/awform-backups/nettoyage-docker.log}"
CIBLE="$HOME/.local/bin/awzid-nettoyage-docker.sh"
LIGNE="23 4 * * 0 $CIBLE"

case "${1:-}" in
  --installer)
    mkdir -p "$(dirname "$CIBLE")"
    install -m 755 "$0" "$CIBLE"
    if crontab -l 2>/dev/null | grep -Fq "$CIBLE"; then
      echo "tâche cron déjà présente : $LIGNE"
    else
      { crontab -l 2>/dev/null || true; echo "$LIGNE"; } | crontab -
      echo "tâche cron ajoutée : $LIGNE"
    fi
    exit 0
    ;;
  --essai)
    docker system df
    echo "--- images inutilisées de plus de $GARDE (seraient effacées) :"
    docker image ls --filter "dangling=false" --format '{{.Repository}}:{{.Tag}} {{.CreatedSince}} {{.Size}}'
    exit 0
    ;;
  "") ;;
  *)
    echo "usage : $0 [--installer|--essai]" >&2
    exit 2
    ;;
esac

mkdir -p "$(dirname "$LOG")"
{
  echo "== $(date -Is) — nettoyage (garde : $GARDE)"
  docker system df
  docker image prune --all --force --filter "until=$GARDE"
  docker builder prune --all --force --filter "until=$GARDE"
  docker system df
} >>"$LOG" 2>&1
# journal borné (2 000 dernières lignes)
tail -n 2000 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
