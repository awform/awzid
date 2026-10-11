# Serveur de bêta Google Cloud — réglages communs (sourcé par les autres scripts de infra/gcp/).
# Aucune valeur secrète ici. Toutes les ressources créées sont préfixées « awzid- » et portent le label app=awzid.
G="${GCLOUD:-$(command -v gcloud || echo "$HOME/google-cloud-sdk/bin/gcloud")}"
PROJET="${AWZID_GCP_PROJET:-project-92eb6b67-858e-471c-b94}"
REGION=europe-west9          # Paris
ZONE=europe-west9-b
VM=awzid-beta
TYPE_VM="${AWZID_GCP_TYPE:-e2-standard-2}"   # 2 vCPU, 8 Go (EXPLOITATION « Serveur de bêta Google Cloud »)
DISQUE_GO=50
IP_NOM=awzid-beta-ip
RESEAU=awzid-net             # réseau DÉDIÉ : les règles « default-allow-* » du réseau default ne s'y appliquent pas
SOUS_RESEAU=awzid-net-paris
PLAGE=10.90.0.0/24
TAG=awzid-beta
SA_NOM=awzid-beta-sa
SA="$SA_NOM@$PROJET.iam.gserviceaccount.com"
AR_DEPOT=awzid
AR_HOTE="$REGION-docker.pkg.dev"
AR="$AR_HOTE/$PROJET/$AR_DEPOT"
BUCKET=awzid-sauvegardes-b7e41c
RETENTION_JOURS=30
ALERTE_EMAIL=awzid21@gmail.com
LABELS=app=awzid
gc() { "$G" --project "$PROJET" --quiet "$@"; }
