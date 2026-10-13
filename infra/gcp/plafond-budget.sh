#!/usr/bin/env bash
# PLAFOND DE DÉPENSE (disjoncteur) du serveur de bêta — complète le budget d'alerte de 10 €/mois que le client a déjà
# réglé dans la console : un budget Google ne fait que PRÉVENIR, il n'arrête rien. Ce script ajoute :
#   - un second budget « plafond » (PLAFOND_EUR, 45 € par défaut) qui publie sur un sujet Pub/Sub ;
#   - une fonction (disjoncteur/main.py) qui ARRÊTE la VM (pas de suppression : le disque et les données restent)
#     quand le coût RÉEL du mois atteint ce plafond ; le client la relance après avoir regardé la facture :
#         gcloud compute instances start awzid-beta --zone europe-west9-b
# Google met les coûts à jour avec quelques heures de retard : le plafond est un filet de sécurité, pas un arrêt à l'euro près.
#   infra/gcp/plafond-budget.sh              → AFFICHE les commandes (mode à blanc : RIEN n'est créé, aucune dépense)
#   infra/gcp/plafond-budget.sh --executer   → les lance (compte gcloud du client déjà connecté ; la facturation du compte
#                                              doit être administrée par lui). Fonctions Cloud : quelques centimes par mois.
# Variables : BILLING_ACCOUNT (identifiant 012345-6789AB-CDEF01, console > Facturation), PLAFOND_EUR (défaut 45).
set -euo pipefail
GCP="$(cd "$(dirname "$0")" && pwd)"
. "$GCP/config.sh"
EXEC=0
[ "${1:-}" = "--executer" ] && EXEC=1
PLAFOND_EUR="${PLAFOND_EUR:-45}"
BILLING_ACCOUNT="${BILLING_ACCOUNT:-A-RENSEIGNER}"
TOPIC=awzid-budget
FN=awzid-disjoncteur
SA_DISJ="awzid-disj@$PROJET.iam.gserviceaccount.com"

lancer() {
  if [ "$EXEC" = 1 ]; then "$@"; else
    printf '  $'
    for a in "$@"; do
      case "$a" in *[!A-Za-z0-9_@%+=:,./-]* | '') printf " '%s'" "$a" ;; *) printf ' %s' "$a" ;; esac
    done
    printf '\n'
  fi
}
if [ "$EXEC" = 1 ]; then
  [ "$BILLING_ACCOUNT" != "A-RENSEIGNER" ] || { echo "BILLING_ACCOUNT à renseigner (console > Facturation)"; exit 2; }
  echo "MODE RÉEL : commandes lancées sur le projet $PROJET."
else
  echo "MODE À BLANC : aucune commande n'est lancée, aucune ressource n'est créée. Ajouter --executer pour agir."
fi
GC=("$G" --project "$PROJET" --quiet)

echo; echo "== 1. Sujet Pub/Sub et services nécessaires à la fonction"
lancer "${GC[@]}" pubsub topics create "$TOPIC" --labels "$LABELS"
lancer "${GC[@]}" services enable cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  eventarc.googleapis.com pubsub.googleapis.com

echo; echo "== 2. Budget plafond de $PLAFOND_EUR EUR par mois (notifie le sujet ; dépense brute, crédits non déduits)"
lancer "$G" billing budgets create --billing-account "$BILLING_ACCOUNT" \
  --display-name "Awzid bêta — plafond ${PLAFOND_EUR} EUR par mois" \
  --budget-amount "${PLAFOND_EUR}EUR" --calendar-period month \
  --filter-projects "projects/$PROJET" --credit-types-treatment exclude-all-credits \
  --threshold-rule percent=0.9 --threshold-rule percent=1.0 \
  --notifications-rule-pubsub-topic "projects/$PROJET/topics/$TOPIC"

echo; echo "== 3. Compte de service de la fonction : il ne peut qu'arrêter une machine"
lancer "${GC[@]}" iam roles create awzidArreterMachine --title "Awzid arrêter une machine" \
  --permissions compute.instances.stop,compute.instances.get,compute.zoneOperations.get
lancer "${GC[@]}" iam service-accounts create awzid-disj --display-name "Awzid disjoncteur du budget"
lancer "${GC[@]}" projects add-iam-policy-binding "$PROJET" --member "serviceAccount:$SA_DISJ" \
  --role "projects/$PROJET/roles/awzidArreterMachine" --condition=None

echo; echo "== 4. Fonction « disjoncteur » (déclenchée par le sujet)"
lancer "${GC[@]}" functions deploy "$FN" --gen2 --runtime python312 --region "$REGION" \
  --source "$GCP/disjoncteur" --entry-point arreter_si_plafond --trigger-topic "$TOPIC" \
  --service-account "$SA_DISJ" --set-env-vars "PROJET=$PROJET,ZONE=$ZONE,MACHINE=$VM" \
  --memory 256Mi --timeout 60s --max-instances 1 --update-labels "$LABELS"

echo; echo "Relancer la machine après un arrêt : $G compute instances start $VM --zone $ZONE --project $PROJET"
