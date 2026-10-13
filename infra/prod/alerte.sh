#!/usr/bin/env bash
# ALERTES SIMPLES PAR E-MAIL (lancé toutes les 15 minutes par awform-alerte.timer, ou à la main) :
#   infra/prod/alerte.sh            lance status.sh ; s'il signale une alerte, envoie UN e-mail au responsable
#   infra/prod/alerte.sh --essai    envoie un e-mail d'essai (vérifier que le courrier arrive)
# Règles : un e-mail à la première alerte, puis un rappel toutes les 6 h tant que la même alerte dure (ou aussitôt si
# elle change), puis un e-mail « rétabli » au retour à la normale. Aucun e-mail si tout va bien.
# Le message est envoyé par le service d'e-mail de l'API (compose : service « alerte », périmètre api.env) à
# AWFORM_ALERTE_A (dans prod.env). Le corps ne contient que des états (services, sauvegardes, disque), jamais de
# donnée personnelle. Sans e-mail réglé, l'alerte est seulement écrite dans ~/.local/state/awform/alerte.log.
# Essais : AWFORM_STATUS_CMD remplace status.sh ; AWFORM_ALERTE_DIR change le dossier d'état.
set -uo pipefail
PROD="$(cd "$(dirname "$0")" && pwd)"
CONF="$HOME/.config/awform"
export AWFORM_ENV_DIR="${AWFORM_ENV_DIR:-$CONF}"
STATE_DIR="${AWFORM_ALERTE_DIR:-$HOME/.local/state/awform}"
STATUS_CMD="${AWFORM_STATUS_CMD:-$PROD/status.sh}"
RAPPEL_S="${AWFORM_ALERTE_RAPPEL_S:-21600}"
umask 077
mkdir -p "$STATE_DIR"
ETAT="$STATE_DIR/alerte.etat"
LOG="$STATE_DIR/alerte.log"
DC=(docker compose -f "$PROD/compose.yml")
now=$(date +%s)

envoyer() { # objet, corps (entrée standard)
  local objet="$1" corps
  corps="$(cat)"
  echo "$(date -Iseconds) $objet" >> "$LOG"
  printf '%s\n' "$corps" | "${DC[@]}" --profile outils run --rm -T alerte "$objet" >> "$LOG" 2>&1
  local rc=$?
  [ "$rc" = 0 ] || echo "$(date -Iseconds) e-mail non envoyé (code $rc) : voir EXPLOITATION § Supervision" >> "$LOG"
  return 0
}

if [ "${1:-}" = "--essai" ]; then
  printf '%s\n' "Ceci est un e-mail d'essai de la supervision d'Awzid ($(hostname))." | envoyer "essai d'alerte"
  tail -3 "$LOG"
  exit 0
fi

SORTIE="$("$STATUS_CMD" 2>&1)"
ALERTES="$(printf '%s\n' "$SORTIE" | grep '^ALERTE' || true)"
if [ -n "$ALERTES" ]; then
  EMPREINTE="$(printf '%s' "$ALERTES" | sha256sum | cut -c1-16)"
  avant="" ; quand=0
  [ -s "$ETAT" ] && read -r avant quand < "$ETAT"
  if [ "$avant" != "$EMPREINTE" ] || [ $((now - quand)) -ge "$RAPPEL_S" ]; then
    printf '%s\n' "$ALERTES" | envoyer "ALERTE — $(printf '%s\n' "$ALERTES" | head -1 | sed 's/^ALERTE *: *//' | cut -c1-80)"
    echo "$EMPREINTE $now" > "$ETAT"
  fi
elif [ -s "$ETAT" ]; then
  printf '%s\n' "Tout est revenu à la normale ($(date '+%d/%m/%Y %H:%M'))." | envoyer "rétabli"
  rm -f "$ETAT"
fi
exit 0
