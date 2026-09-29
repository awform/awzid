#!/usr/bin/env bash
# État des sauvegardes, lu dans le JOURNAL (pas l'âge d'un fichier, qui peut être partiel : audit INF-7/INF-8).
#   infra/prod/backup-status.sh [dossier des sauvegardes]   → code 1 et lignes « ALERTE » si quelque chose manque
# Alertes : dernière sauvegarde réussie de plus de 26 h, dernière tentative en échec, copie hors site en
# échec, aucune restauration testée depuis 35 jours.
set -uo pipefail
DEST="${1:-${AWFORM_BACKUP_DIR:-$HOME/awform-backups}}"
LOG="$DEST/backup.log"
BAD=0
warn() { echo "ALERTE : $*"; BAD=1; }
age_h() { echo $(( ($(date +%s) - $(date -d "$1" +%s)) / 3600 )); }
[ -f "$LOG" ] || { warn "aucun journal de sauvegarde ($LOG)"; exit 1; }
OK="$(grep -E '^[^ ]+ ok awform-' "$LOG" | tail -1)"
if [ -z "$OK" ]; then warn "aucune sauvegarde réussie"; else
  A="$(age_h "${OK%% *}")"
  echo "dernière sauvegarde : $(echo "$OK" | cut -d' ' -f3) (il y a ${A} h)"
  [ "$A" -le 26 ] || warn "dernière sauvegarde réussie de plus de 26 h"
fi
LAST="$(grep -E '^[^ ]+ (ok awform-|ÉCHEC)' "$LOG" | tail -1)"
case "$LAST" in *ÉCHEC*) warn "dernière tentative de sauvegarde en échec : ${LAST#* }" ;; esac
HS="$(grep -E '^[^ ]+ hors-site ' "$LOG" | tail -1)"
if [ -z "$HS" ]; then echo "avis : copie hors site non branchée (AWFORM_BACKUP_HORS_SITE, décision D10)"
else
  case "$HS" in *ÉCHEC*) warn "copie hors site en échec : ${HS#* }" ;; *) echo "copie hors site : ${HS#* }" ;; esac
fi
R="$(grep -E '^[^ ]+ restauration testée ok' "$LOG" | tail -1)"
if [ -z "$R" ]; then warn "aucune restauration testée (restore-test.sh, au moins une fois par mois)"; else
  D=$(( $(age_h "${R%% *}") / 24 ))
  echo "dernière restauration testée : il y a ${D} j"
  [ "$D" -le 35 ] || warn "dernière restauration testée il y a plus de 35 jours"
fi
exit "$BAD"
