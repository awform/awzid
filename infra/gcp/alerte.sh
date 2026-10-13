#!/usr/bin/env bash
# Alerte e-mail si le serveur de bêta tombe (idempotent ; depuis le poste où gcloud est connecté) :
#   infra/gcp/alerte.sh
# Canal e-mail « Awzid — exploitation » (ALERTE_EMAIL) et règle « Awzid bêta — service en panne » sur la
# métrique custom.googleapis.com/awzid/sante (envoyée par le serveur, sante-metrique.sh) :
#   - valeur < 1 pendant 3 min (API ou base en panne), OU
#   - aucune valeur pendant 5 min (VM arrêtée, Docker arrêté, réseau).
# Ne demande AUCUNE ouverture du service : la mesure part du serveur (sortant), rien n'entre.
set -euo pipefail
. "$(dirname "$0")/config.sh"
API=https://monitoring.googleapis.com/v3/projects/$PROJET
TOK="$("$G" auth print-access-token)"
req() { curl -fsS -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' "$@"; }

CANAL="$(req "$API/notificationChannels" | jq -r --arg e "$ALERTE_EMAIL" \
  '.notificationChannels[]? | select(.type=="email" and .labels.email_address==$e) | .name' | head -1)"
if [ -z "$CANAL" ]; then
  CANAL="$(req -X POST "$API/notificationChannels" -d "$(jq -n --arg e "$ALERTE_EMAIL" \
    '{type:"email",displayName:"Awzid — exploitation",labels:{email_address:$e},userLabels:{app:"awzid"}}')" | jq -r .name)"
  echo "canal créé : $CANAL"
else
  echo "canal existant : $CANAL"
fi

NOM="Awzid bêta — service en panne"
if req "$API/alertPolicies" | jq -e --arg n "$NOM" '.alertPolicies[]? | select(.displayName==$n)' >/dev/null; then
  echo "règle existante : $NOM"; exit 0
fi
FILTRE='metric.type="custom.googleapis.com/awzid/sante" AND resource.type="gce_instance"'
req -X POST "$API/alertPolicies" -d "$(jq -n --arg n "$NOM" --arg f "$FILTRE" --arg c "$CANAL" '{
  displayName:$n, combiner:"OR", enabled:true, notificationChannels:[$c], userLabels:{app:"awzid"},
  documentation:{mimeType:"text/markdown",content:"Serveur awzid-beta (europe-west9-b). Procédure : docs/projet/EXPLOITATION.md, « Serveur de bêta Google Cloud » puis § 2 (incident). Diagnostic : infra/gcp/serveur.sh ssh puis infra/prod/status.sh."},
  alertStrategy:{autoClose:"1800s"},
  conditions:[
   {displayName:"API en panne (santé = 0 pendant 3 min)",
    conditionThreshold:{filter:$f,comparison:"COMPARISON_LT",thresholdValue:1,duration:"180s",
      aggregations:[{alignmentPeriod:"60s",perSeriesAligner:"ALIGN_MIN"}],trigger:{count:1}}},
   {displayName:"Plus de nouvelles du serveur (5 min)",
    conditionAbsent:{filter:$f,duration:"300s",
      aggregations:[{alignmentPeriod:"60s",perSeriesAligner:"ALIGN_MEAN"}],trigger:{count:1}}}]}')" \
  | jq -r '"règle créée : " + .name'
