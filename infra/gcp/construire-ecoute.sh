#!/usr/bin/env bash
# Image d'écoute (A5) construite par Cloud Build dans le projet (europe-west9), poussée dans Artifact Registry
# « awzid » — évite d'envoyer ≈ 1,5 Go depuis la connexion de la maison (accord du client du 11/10/2026).
#   infra/gcp/construire-ecoute.sh <version>        (depuis un worktree du dépôt, VM de dev)
# N'envoie QUE ce que le Dockerfile copie : services/ecoute-ia/{Dockerfile,ecoute.py,asr.py,tests/} (≈ 30 Ko).
# Compte de construction DÉDIÉ « awzid-build-sa » (Cloud Build exige un compte géré par l'utilisateur ; le
# compte Compute par défaut n'a aucun rôle dans ce projet) : écriture sur le SEUL dépôt « awzid », objets du
# SEUL bucket de construction (source + journaux, effacés à 7 jours). Aucun rôle au niveau du projet.
set -euo pipefail
. "$(dirname "$0")/config.sh"
V="${1:?version attendue}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/services/ecoute-ia"
BNOM=awzid-build-sa
BSA="$BNOM@$PROJET.iam.gserviceaccount.com"
BB=awzid-construction-b7e41c
existe() { "$@" >/dev/null 2>&1; }
gc services enable cloudbuild.googleapis.com
existe gc iam service-accounts describe "$BSA" || gc iam service-accounts create "$BNOM" --display-name "Awzid (construction des images)"
if ! existe gc storage buckets describe "gs://$BB"; then
  gc storage buckets create "gs://$BB" --location "$REGION" --uniform-bucket-level-access --public-access-prevention
  R="$(mktemp)"; echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":7}}]}' > "$R"
  gc storage buckets update "gs://$BB" --lifecycle-file "$R" --update-labels "$LABELS" >/dev/null; rm -f "$R"
fi
# objets (source, journaux) + lecture du bucket lui-même (Cloud Build vérifie storage.buckets.get)
for r in roles/storage.objectAdmin roles/storage.legacyBucketReader; do
  for i in 1 2 3 4 5 6; do
    gc storage buckets add-iam-policy-binding "gs://$BB" --member "serviceAccount:$BSA" --role "$r" >/dev/null && break
    sleep 10
  done
done
gc artifacts repositories add-iam-policy-binding "$AR_DEPOT" --location "$REGION" \
  --member "serviceAccount:$BSA" --role roles/artifactregistry.writer >/dev/null
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
cp "$SRC/Dockerfile" "$SRC/ecoute.py" "$SRC/asr.py" "$T/"
cp -r "$SRC/tests" "$T/"
cat > "$T/cloudbuild.yaml" <<EOF
steps:
  - name: gcr.io/cloud-builders/docker
    args: ['build', '--target', 'service', '-t', '$AR/ecoute-ia:$V', '.']
images: ['$AR/ecoute-ia:$V']
timeout: 3600s
logsBucket: gs://$BB/journaux
options: { logging: GCS_ONLY }
EOF
echo "envoyé : $(cd "$T" && find . -type f | sort | tr '\n' ' ')"
gc builds submit "$T" --region "$REGION" --config "$T/cloudbuild.yaml" \
  --gcs-source-staging-dir "gs://$BB/source" \
  --service-account "projects/$PROJET/serviceAccounts/$BSA" --suppress-logs 2>&1 | tail -5
gc builds list --region "$REGION" --limit 1 --format='table(id,status,createTime,duration())'
gc artifacts docker images list "$AR/ecoute-ia" --include-tags --format='table(tags,metadata.imageSizeBytes)'
