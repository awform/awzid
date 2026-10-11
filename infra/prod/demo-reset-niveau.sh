#!/usr/bin/env bash
# DÉMONSTRATION seulement : remet un ou plusieurs comptes de niveau au DÉBUT de leur niveau (progression effacée,
# niveau d'arabe et de religion remis, réglage d'évaluation par défaut). Les autres comptes ne sont pas touchés.
#   infra/prod/demo-reset-niveau.sh adulte3            # un compte
#   infra/prod/demo-reset-niveau.sh adulte3 enfant2    # plusieurs
#   infra/prod/demo-reset-niveau.sh --tous             # les 19 comptes de niveau
# Identifiants : adulte1…adulte10, ado1…ado4, enfant1…enfant5. Refusé hors démonstration (prod.env sans AWFORM_DEMO=1).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROD="$ROOT/infra/prod"
CONF="$HOME/.config/awform"
ENVF="$CONF/prod.env"
DEMOF="$CONF/demo.env"
[ $# -gt 0 ] || { sed -n 2,8p "$0"; exit 2; }
grep -qx 'AWFORM_DEMO=1' "$ENVF" 2>/dev/null || { echo "refusé : ce n'est pas une instance de démonstration (AWFORM_DEMO=1 absent de prod.env)"; exit 1; }
[ -f "$DEMOF" ] || { echo "refusé : $DEMOF absent (lancer deploy.sh --demo)"; exit 1; }
if [ "$1" = "--tous" ]; then
  set -- adulte1 adulte2 adulte3 adulte4 adulte5 adulte6 adulte7 adulte8 adulte9 adulte10 \
    ado1 ado2 ado3 ado4 enfant1 enfant2 enfant3 enfant4 enfant5
fi
for a in "$@"; do
  case "$a" in
    adulte[1-9] | adulte10 | ado[1-4] | enfant[1-5]) ;;
    *) echo "identifiant inconnu : $a (adulte1…adulte10, ado1…ado4, enfant1…enfant5)"; exit 2 ;;
  esac
done
set -a
# shellcheck source=/dev/null
. "$DEMOF"
set +a
export AWFORM_ENV_DIR="$CONF"
export AWFORM_CONTENT_DIR="${AWFORM_CONTENT_DIR:-$HOME/awform-content}"
AWFORM_VERSION="${AWFORM_VERSION:-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)}"
export AWFORM_VERSION
docker compose -f "$PROD/compose.yml" --profile outils run --rm -T --entrypoint node \
  -e AWFORM_DEMO=1 -e AWFORM_DEMO_TAG \
  demo dist/cli/demo-reset-niveau.js "$@"
