#!/usr/bin/env bash
# A34 — synchronisation HEBDOMADAIRE du Muṣḥaf exact (Content Sync de Quran Foundation : au moins tous les 7 jours,
# conditions développeur QF). Lancée par cron sur le serveur (voir EXPLOITATION.md § 10) :
#   17 3 * * 1  $HOME/awform-demo/infra/outils/qf-lignes/synchro-hebdo.sh
# Secret : fichier ${AWFORM_QF_SECRET:-$HOME/.config/awform/qf.env} (droits 600, hors dépôt), trois lignes :
#   QF_CLIENT_ID=…
#   QF_CLIENT_SECRET=…
#   QF_ENV=production
# Le fichier est LU (jamais exécuté) ; le secret ne passe jamais en argument ni dans le journal.
# Échec du contrôle : l'ancienne publication reste servie (code 1) ; ressource retirée par QF : publication
# supprimée (code 3). L'API relit le manifeste à chaque demande : rien à redémarrer.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SECRET="${AWFORM_QF_SECRET:-$HOME/.config/awform/qf.env}"
DIR="${AWFORM_QF_MUSHAF_SOURCE:-$HOME/awform-data/qf-mushaf-prod}"
POLICES="${AWFORM_QCF_SOURCE:-$HOME/awform-data/qcf-1405}"
LOG="$DIR/synchro.log"
mkdir -p "$DIR"
horo() { date -u +%Y-%m-%dT%H:%M:%SZ; }
if [ ! -f "$SECRET" ]; then
  echo "$(horo) ÉCHEC : fichier secret absent ($SECRET)" >>"$LOG"
  exit 2
fi
if [ "$(stat -c %a "$SECRET")" != 600 ]; then
  echo "$(horo) ÉCHEC : $SECRET doit avoir les droits 600" >>"$LOG"
  exit 2
fi
while IFS='=' read -r k v; do
  case "$k" in
    QF_CLIENT_ID | QF_CLIENT_SECRET | QF_ENV) export "$k=$v" ;;
    '' | \#*) ;;
    *) echo "$(horo) ÉCHEC : clé inattendue dans $SECRET" >>"$LOG"; exit 2 ;;
  esac
done <"$SECRET"
: "${QF_ENV:=production}"
export QF_ENV
echo "$(horo) début ($QF_ENV)" >>"$LOG"
set +e
node "$HERE/qf-lignes.mjs" sync --dir "$DIR" --polices "$POLICES" >>"$LOG" 2>&1
code=$?
set -e
echo "$(horo) fin : code $code" >>"$LOG"
exit "$code"
