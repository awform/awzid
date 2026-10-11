#!/usr/bin/env bash
# Serveur de bêta Google Cloud — création IDEMPOTENTE des ressources (depuis un poste où gcloud est connecté
# au compte du client) :   infra/gcp/creer-ressources.sh
# Ne modifie AUCUNE ressource existante : réseau dédié, règles, compte de service, dépôt, bucket et VM neufs,
# tous préfixés « awzid- ». Seuls ajouts au niveau du projet : activation des API artifactregistry et iap,
# et le rôle « monitoring.metricWriter » donné au SEUL compte de service du serveur (santé → alerte).
# Rien n'est ouvert au public : SSH seulement par IAP (35.235.240.0/20) ; la règle HTTP/HTTPS est créée
# DÉSACTIVÉE (ouverture : infra/gcp/ouvrir-web.sh, au moment de la mise en ligne).
set -euo pipefail
. "$(dirname "$0")/config.sh"
existe() { "$@" >/dev/null 2>&1; }

echo "== API"
gc services enable artifactregistry.googleapis.com iap.googleapis.com

echo "== réseau dédié"
existe gc compute networks describe "$RESEAU" || gc compute networks create "$RESEAU" --subnet-mode=custom
existe gc compute networks subnets describe "$SOUS_RESEAU" --region "$REGION" \
  || gc compute networks subnets create "$SOUS_RESEAU" --network "$RESEAU" --region "$REGION" --range "$PLAGE" \
    --enable-private-ip-google-access
existe gc compute firewall-rules describe awzid-allow-iap-ssh \
  || gc compute firewall-rules create awzid-allow-iap-ssh --network "$RESEAU" --direction INGRESS \
    --action allow --rules tcp:22 --source-ranges 35.235.240.0/20 --target-tags "$TAG" \
    --description "Awzid bêta : SSH uniquement par IAP"
existe gc compute firewall-rules describe awzid-allow-web \
  || gc compute firewall-rules create awzid-allow-web --network "$RESEAU" --direction INGRESS \
    --action allow --rules tcp:80,tcp:443 --source-ranges 0.0.0.0/0 --target-tags "$TAG" --disabled \
    --description "Awzid : HTTP/HTTPS public — DÉSACTIVÉE jusqu'à l'ouverture (infra/gcp/ouvrir-web.sh)"

echo "== IP statique"
existe gc compute addresses describe "$IP_NOM" --region "$REGION" \
  || gc compute addresses create "$IP_NOM" --region "$REGION" --network-tier PREMIUM \
    --description "Awzid bêta (serveur awzid-beta)"
gc compute addresses update "$IP_NOM" --region "$REGION" --update-labels "$LABELS" >/dev/null 2>&1 || true
IP="$(gc compute addresses describe "$IP_NOM" --region "$REGION" --format='value(address)')"

echo "== compte de service du serveur"
existe gc iam service-accounts describe "$SA" \
  || gc iam service-accounts create "$SA_NOM" --display-name "Awzid bêta (serveur)"
# (compte neuf : quelques secondes avant d'être visible par IAM — nouvelles tentatives)
for r in roles/monitoring.metricWriter; do
  for i in 1 2 3 4 5 6; do
    gc projects add-iam-policy-binding "$PROJET" --member "serviceAccount:$SA" --role "$r" --condition=None \
      >/dev/null && break
    [ "$i" = 6 ] && exit 1
    sleep 10
  done
done

echo "== Artifact Registry"
existe gc artifacts repositories describe "$AR_DEPOT" --location "$REGION" \
  || gc artifacts repositories create "$AR_DEPOT" --repository-format docker --location "$REGION" \
    --labels "$LABELS" --description "Images Awzid (bêta)"
gc artifacts repositories add-iam-policy-binding "$AR_DEPOT" --location "$REGION" \
  --member "serviceAccount:$SA" --role roles/artifactregistry.reader >/dev/null

echo "== bucket des sauvegardes"
if ! existe gc storage buckets describe "gs://$BUCKET"; then
  gc storage buckets create "gs://$BUCKET" --location "$REGION" --default-storage-class STANDARD \
    --uniform-bucket-level-access --public-access-prevention
fi
REGLE="$(mktemp)"
cat > "$REGLE" <<EOF
{"rule":[{"action":{"type":"Delete"},"condition":{"age":$RETENTION_JOURS}}]}
EOF
gc storage buckets update "gs://$BUCKET" --lifecycle-file "$REGLE" --update-labels "$LABELS" >/dev/null
rm -f "$REGLE"
# le serveur ÉCRIT de nouveaux objets et les LIT (test de restauration) ; il ne peut ni écraser ni effacer
for r in roles/storage.objectCreator roles/storage.objectViewer; do
  gc storage buckets add-iam-policy-binding "gs://$BUCKET" --member "serviceAccount:$SA" --role "$r" >/dev/null
done

echo "== VM"
if ! existe gc compute instances describe "$VM" --zone "$ZONE"; then
  gc compute instances create "$VM" --zone "$ZONE" --machine-type "$TYPE_VM" \
    --image-family debian-12 --image-project debian-cloud \
    --boot-disk-size "${DISQUE_GO}GB" --boot-disk-type pd-balanced --boot-disk-device-name "$VM" \
    --network "$RESEAU" --subnet "$SOUS_RESEAU" --address "$IP" --network-tier PREMIUM \
    --tags "$TAG" --labels "$LABELS" \
    --service-account "$SA" --scopes cloud-platform \
    --metadata enable-oslogin=TRUE,block-project-ssh-keys=TRUE \
    --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring \
    --deletion-protection
fi
gc compute instances describe "$VM" --zone "$ZONE" \
  --format='table(name,machineType.basename(),status,networkInterfaces[0].accessConfigs[0].natIP,labels)'
echo "IP réservée : $IP (aucun DNS ; HTTP/HTTPS fermés)"
