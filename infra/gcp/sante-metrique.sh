#!/usr/bin/env bash
# Serveur de bêta : envoie chaque minute (awzid-sante.timer) la santé de l'API à Cloud Monitoring, métrique
# custom.googleapis.com/awzid/sante (1 = API « ok » et base joignable, 0 = en panne). Jeton du compte de service
# de la VM (serveur de métadonnées) : aucune clé stockée. L'alerte (infra/gcp/alerte.sh) se déclenche si la
# valeur vaut 0 pendant 3 minutes OU si la métrique n'arrive plus pendant 5 minutes (VM arrêtée, réseau).
set -uo pipefail
MD=http://metadata.google.internal/computeMetadata/v1
h() { curl -fsS -H 'Metadata-Flavor: Google' "$MD/$1"; }
PROJET="$(h project/project-id)"
ID="$(h instance/id)"
ZONE="$(h instance/zone | awk -F/ '{print $NF}')"
TOKEN="$(h instance/service-accounts/default/token | jq -r .access_token)"
V=0
curl -fsS --max-time 10 http://127.0.0.1/api/v1/health 2>/dev/null | grep -q '"status":"ok"' && V=1
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BODY=$(jq -n --arg id "$ID" --arg z "$ZONE" --arg p "$PROJET" --arg t "$NOW" --argjson v "$V" '{timeSeries:[{
  metric:{type:"custom.googleapis.com/awzid/sante"},
  resource:{type:"gce_instance",labels:{project_id:$p,instance_id:$id,zone:$z}},
  points:[{interval:{endTime:$t},value:{int64Value:($v|tostring)}}]}]}')
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  "https://monitoring.googleapis.com/v3/projects/$PROJET/timeSeries" -d "$BODY" >/dev/null \
  || logger -t awzid-sante "envoi de la métrique en échec"
[ "$V" = 1 ] || logger -t awzid-sante "API en panne"
