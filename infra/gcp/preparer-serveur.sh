#!/usr/bin/env bash
# À lancer SUR le serveur de bêta (une fois, idempotent) : Docker (dépôt officiel Docker pour Debian 12, avec
# le greffon compose), outils des sauvegardes, fuseau horaire, et accès Docker au registre Artifact Registry
# par le compte de service de la VM (aide « gcloud » : aucune clé stockée).
#   bash infra/gcp/preparer-serveur.sh
set -euo pipefail
REGION=europe-west9
export DEBIAN_FRONTEND=noninteractive
sudo timedatectl set-timezone Europe/Paris
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  sudo apt-get update -q
  sudo apt-get install -yq ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -q
  sudo apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
sudo apt-get install -yq gnupg rsync jq openssl unattended-upgrades >/dev/null
sudo systemctl enable --now docker >/dev/null
sudo usermod -aG docker "$USER"
# journaux Docker bornés pour tout conteneur (compose.yml borne déjà ses services)
if [ ! -f /etc/docker/daemon.json ]; then
  echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"5"}}' | sudo tee /etc/docker/daemon.json >/dev/null
  sudo systemctl restart docker
fi
# registre : aide d'identification gcloud (jeton du compte de service de la VM, renouvelé à chaque tirage)
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet >/dev/null 2>&1
sudo -u "$USER" gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet >/dev/null 2>&1 || true
docker --version; docker compose version
free -h | head -2; df -h / | tail -1
