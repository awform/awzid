#!/usr/bin/env bash
# Pousse les images d'une version vers Artifact Registry (europe-west9, dépôt « awzid »), depuis la VM de dev :
#   infra/gcp/pousser-images.sh <version>        (ex. 31dc991 = git rev-parse --short HEAD de main)
# Les images doivent déjà exister localement (awform/{api,web,worker,outils-audio}:<version>,
# awzid/ecoute-ia:<version>) : construites par `docker compose -f infra/prod/compose.yml build` (et
# `--profile ecoute build ecoute`) sur la version fusionnée, sous `flock ~/.awzid-e2e.lock`.
# Connexion au registre par jeton d'accès de courte durée, dans une configuration Docker TEMPORAIRE (la
# configuration Docker de la VM de dev n'est pas modifiée ; aucune clé de compte de service).
set -euo pipefail
. "$(dirname "$0")/config.sh"
V="${1:?version attendue}"
IMAGES=(awform/api awform/web awform/worker awform/outils-audio awzid/ecoute-ia)
for i in "${IMAGES[@]}"; do docker image inspect "$i:$V" >/dev/null || { echo "image absente : $i:$V"; exit 1; }; done
export DOCKER_CONFIG="$(mktemp -d)"
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
"$G" auth print-access-token | docker login -u oauth2accesstoken --password-stdin "https://$AR_HOTE" >/dev/null
for i in "${IMAGES[@]}"; do
  dst="$AR/${i#*/}:$V"
  docker tag "$i:$V" "$dst"
  echo "-> $dst"
  docker push -q "$dst"
  docker rmi "$dst" >/dev/null   # étiquette locale seulement (l'image $i:$V reste)
done
echo "images poussées : $AR/*:$V"
