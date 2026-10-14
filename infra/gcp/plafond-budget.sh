#!/usr/bin/env bash
# ALERTE DE BUDGET UNIQUE du serveur de bêta : 80 € par mois (décision du référent, 14/10/2026). Le client l'a DÉJÀ réglée dans la
# console ; ce script ne sert qu'à la recréer si elle disparaissait. Il ne crée QU'UN budget d'alerte (e-mail aux administrateurs de
# la facturation, seuil de 100 %) : plus de second budget, plus de sujet Pub/Sub, plus de fonction, et surtout PLUS D'ARRÊT DE LA
# MACHINE (l'ancien « disjoncteur » qui arrêtait la VM à 45 € est supprimé : il l'aurait coupée avant la fin du mois, le coût normal
# étant ≈ 60 €).
# « Disjoncteur » = seulement les fonctions coûteuses (écoute IA ; voix à la demande quand elle existera), jamais la machine : à
# réception de l'alerte, l'exploitant pose `AWFORM_COUTS_COUPES=1` dans prod.env (docs/projet/EXPLOITATION.md, § Budget).
# Google met les coûts à jour avec quelques heures de retard : c'est un avertissement, pas un arrêt à l'euro près.
#   infra/gcp/plafond-budget.sh              → AFFICHE la commande (mode à blanc : RIEN n'est créé, aucune dépense)
#   infra/gcp/plafond-budget.sh --executer   → la lance (compte gcloud du client déjà connecté ; la facturation du compte
#                                              doit être administrée par lui).
# Variables : BILLING_ACCOUNT (identifiant 012345-6789AB-CDEF01, console > Facturation), ALERTE_EUR (défaut 80).
set -euo pipefail
GCP="$(cd "$(dirname "$0")" && pwd)"
. "$GCP/config.sh"
EXEC=0
[ "${1:-}" = "--executer" ] && EXEC=1
ALERTE_EUR="${ALERTE_EUR:-80}"
BILLING_ACCOUNT="${BILLING_ACCOUNT:-A-RENSEIGNER}"

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
  echo "MODE RÉEL : commande lancée sur le projet $PROJET."
else
  echo "MODE À BLANC : aucune commande n'est lancée, aucune ressource n'est créée. Ajouter --executer pour agir."
fi

echo; echo "== Alerte unique de $ALERTE_EUR EUR par mois (e-mail ; dépense brute, crédits non déduits) — aucun arrêt de machine"
lancer "$G" billing budgets create --billing-account "$BILLING_ACCOUNT" \
  --display-name "Awzid bêta — alerte ${ALERTE_EUR} EUR par mois" \
  --budget-amount "${ALERTE_EUR}EUR" --calendar-period month \
  --filter-projects "projects/$PROJET" --credit-types-treatment exclude-all-credits \
  --threshold-rule percent=1.0

echo; echo "Alerte reçue : couper les fonctions coûteuses SANS toucher à la machine → AWFORM_COUTS_COUPES=1 dans prod.env, puis infra/prod/deploy.sh."
