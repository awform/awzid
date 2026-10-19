#!/usr/bin/env bash
# Batterie de contrôle du tuteur de CONVERSATION (TUTEUR_IA.md § 9), SUR le serveur de bêta :
#   bash ~/awform-app/infra/gcp/tuteur-batterie.sh            # vrai modèle (Vertex AI, UE) : quelques centimes
#   bash ~/awform-app/infra/gcp/tuteur-batterie.sh --simule   # essai à blanc, aucun appel
# Lancée avec l'IMAGE de l'API en service (même code, même invite que l'API) ; jeton du serveur de métadonnées
# échangé contre celui du compte emprunté `awzid-tuteur` (aucune clé). Arrêt net à 1 € (--plafond-eur pour changer).
# Rapports : ~/tuteur-batterie/batterie-<date>.json et .md ; code de sortie 0 = réussie.
# Projet, lieu, compte et modèle : lus dans ~/.config/awform/prod.env s'ils y sont, sinon valeurs de TUTEUR_IA.md § 10.
set -euo pipefail
cd ~/awform-app
ENV_FILE=~/.config/awform/prod.env
lire() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
PROJET=$(lire AWFORM_VERTEX_PROJET); PROJET=${PROJET:-project-92eb6b67-858e-471c-b94}
LIEU=$(lire AWFORM_VERTEX_LIEU); LIEU=${LIEU:-eu}
COMPTE=$(lire AWFORM_VERTEX_COMPTE); COMPTE=${COMPTE:-awzid-tuteur@${PROJET}.iam.gserviceaccount.com}
MODELE=$(lire AWFORM_TUTEUR_VERTEX_MODELE); MODELE=${MODELE:-gemini-3.8-flash}
CONTENU=${AWFORM_CONTENT_DIR:-$HOME/awform-content}
SORTIE=~/tuteur-batterie
mkdir -p "$SORTIE"
# image de l'API EN SERVICE (sinon celle de la version notée au déploiement)
API=$(AWFORM_ENV_DIR=~/.config/awform docker compose -f infra/prod/compose.yml ps -q api 2>/dev/null | head -1 || true)
if [ -n "$API" ]; then IMAGE=$(docker inspect --format '{{.Config.Image}}' "$API")
else IMAGE="awform/api:$(cat ~/.config/awform/version-en-service)"; fi
echo "Image : $IMAGE ; modèle : $MODELE ($LIEU) ; compte emprunté : $COMPTE"
MODE=(--confirmer)
for a in "$@"; do [ "$a" = --simule ] && MODE=(); done
set +e
docker run --rm --network host --user "$(id -u):$(id -g)" \
  -v "$CONTENU:/content:ro" -v "$SORTIE:/sortie" -e AWFORM_CONTENT_DIR=/content \
  --entrypoint node "$IMAGE" node_modules/@awform/tutor/dist/cli/batterie-conversation.js \
  --projet "$PROJET" --lieu "$LIEU" --compte "$COMPTE" --modele "$MODELE" \
  --sortie "/sortie/batterie-$(date +%Y%m%d-%H%M)" "${MODE[@]}" "$@"
CODE=$?
echo "Rapports : $(ls -t "$SORTIE"/*.md 2>/dev/null | head -1) (et .json) ; code $CODE (0 = réussie)"
exit $CODE
