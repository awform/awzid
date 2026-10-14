#!/usr/bin/env bash
# À lancer SUR le serveur de bêta Google Cloud (idempotent) :
#   AWFORM_VERSION=<version> bash ~/awform-app/infra/gcp/deployer-beta.sh
# 1. tire les images de la version depuis Artifact Registry et les étiquette awform/*:<version> (aucune
#    construction sur le serveur, aucune clé GitHub) ; l'image d'écoute est facultative ;
# 2. réglages de la petite machine (infra/prod/.env, lu par Docker Compose : CPU et mémoire de l'écoute) ;
# 3. sauvegarde hors site vers Cloud Storage (backup.env, aucun secret) ;
# 4. infra/prod/deploy.sh en mode PRODUCTION (jamais --demo) : secrets neufs générés sur place (prod.env, 600,
#    jamais affichés), HTTP -> HTTPS sur le domaine, http://localhost toujours servi (tunnel IAP) ;
# 5. métrique de santé envoyée chaque minute à Cloud Monitoring (alerte e-mail).
set -euo pipefail
GCP="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$GCP/../.." && pwd)"
PROD="$ROOT/infra/prod"
. "$GCP/config.sh"
V="${AWFORM_VERSION:?AWFORM_VERSION attendu (ex. 31dc991)}"
# nom canonique awzid.com (décision du client du 13/10) ; www.awzid.com et app.awzid.com redirigent en 301 vers lui
DOMAINE="${AWZID_DOMAINE:-awzid.com}"
ALIAS=(--alias "www.$DOMAINE" --alias "app.$DOMAINE")
CONF="$HOME/.config/awform"
umask 077
mkdir -p "$CONF" "$ROOT/services/ecoute-ia"

echo "== 1. images $V"
ECOUTE_IMG=0
for i in awform/api awform/web awform/worker awform/outils-audio awzid/ecoute-ia; do
  if docker image inspect "$i:$V" >/dev/null 2>&1; then :; elif docker pull -q "$AR/${i#*/}:$V" >/dev/null 2>&1; then
    docker tag "$AR/${i#*/}:$V" "$i:$V"
  elif [ "$i" = awzid/ecoute-ia ]; then
    echo "image d'écoute absente du registre : service d'écoute NON démarré"; continue
  else
    echo "ÉCHEC : image $AR/${i#*/}:$V introuvable"; exit 1
  fi
  [ "$i" = awzid/ecoute-ia ] && ECOUTE_IMG=1
  echo "ok $i:$V"
done

echo "== 2. réglages de la machine"
# 2 vCPU / 8 Go (e2-standard-2) : l’écoute (≈ 2,3 Go) borne à 1,5 CPU, 3 Go et 1 fil, un calcul à la fois (laisse 0,5 CPU à Caddy, à l’API et à la base)
cat > "$PROD/.env" <<EOF
AWFORM_ECOUTE_CPUS=1.5
AWFORM_ECOUTE_MEM=3g
AWFORM_ECOUTE_THREADS=1
AWFORM_ECOUTE_CONCURRENCE=1
EOF
MODELE="${AWFORM_MODELE_ECOUTE:-$HOME/modeles-ia/nvidia_stt_ar_fastconformer_hybrid_large_pcd_v1.0}"
ECOUTE=0
if [ "$ECOUTE_IMG" = 1 ] && ls "$MODELE"/*.nemo >/dev/null 2>&1 && [ "${AWZID_ECOUTE:-1}" = 1 ]; then ECOUTE=1; fi
# interrupteur passé par l'ENVIRONNEMENT (ecoute-env.sh) : prod.env n'est jamais créé ici, deploy.sh y
# génère les secrets au premier passage
export AWFORM_ECOUTE="$ECOUTE"
echo "écoute : $ECOUTE"
[ ! -f "$CONF/qf.env" ] || chmod 600 "$CONF/qf.env"
echo "AWFORM_BACKUP_HORS_SITE=gs://$BUCKET/awform" > "$CONF/backup.env"

# copies reçues par tar (droits d'origine, propriétaire = compte OS Login) : lisibles par les conteneurs
# (utilisateur « node ») ; contenus publics, aucun secret
for d in "$HOME/awform-content" "$HOME/lecons-audio" "$HOME/awform-data" "$HOME/modeles-ia"; do
  # (un dossier absent au premier déploiement est créé vide par Docker, au nom de root : ignoré)
  [ -d "$d" ] && [ -O "$d" ] && chmod -R a+rX "$d"
done

echo "== 3. déploiement (production)"
AWFORM_DEPLOY_BUILD=0 AWFORM_VERSION="$V" "$PROD/deploy.sh" --production --site "$DOMAINE" "${ALIAS[@]}"

echo "== 4. santé -> Cloud Monitoring (chaque minute)"
sudo install -m 755 "$GCP/sante-metrique.sh" /usr/local/bin/awzid-sante-metrique
sudo tee /etc/systemd/system/awzid-sante.service >/dev/null <<EOF
[Unit]
Description=Awzid — santé de l'API vers Cloud Monitoring
[Service]
Type=oneshot
ExecStart=/usr/local/bin/awzid-sante-metrique
EOF
sudo tee /etc/systemd/system/awzid-sante.timer >/dev/null <<EOF
[Unit]
Description=Awzid — santé chaque minute
[Timer]
OnBootSec=2min
OnUnitActiveSec=60s
AccuracySec=5s
[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now awzid-sante.timer >/dev/null
sudo systemctl start awzid-sante.service
echo "déployé : version $V (privé : http://localhost par le tunnel IAP, infra/gcp/serveur.sh tunnel)"
