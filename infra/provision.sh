#!/usr/bin/env bash
# AWFORM — socle de la VM de développement (LOT 0).
# Idempotent : peut être relancé sans risque ; chaque étape vérifie avant d'agir.
# Usage (sur la VM, utilisateur ordinaire avec sudo) :  bash infra/provision.sh
# Cible : Ubuntu Server 26.04 LTS. Aucun service n'est exposé sur Internet :
#   - SSH (22) ouvert ; ports de développement accessibles depuis 192.168.50.0/24 seulement ;
#   - PostgreSQL écoute sur localhost uniquement ;
#   - Docker : publier les ports des conteneurs sur 127.0.0.1 (Docker contourne ufw).
set -euo pipefail

NODE_MAJOR=24                # Node.js LTS active en septembre 2026 (« Krypton ») ; 26 devient LTS fin octobre 2026
PNPM_VERSION=10.34.5         # figé ici et dans package.json (packageManager)
LAN_CIDR=192.168.50.0/24
DEV_PORTS=(5173 4173 3000)   # vite dev, vite preview, API Fastify
DB_ROLE=awform
DB_NAMES=(awform_dev awform_test)
SECRETS_FILE="$HOME/.config/awform/dev.env"   # hors dépôt, droits 600

export DEBIAN_FRONTEND=noninteractive
log() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
apt_install() { sudo apt-get install -y --no-install-recommends "$@" >/dev/null; }

log "1. Mises à jour du système"
sudo apt-get update -qq
sudo apt-get -y -qq -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade >/dev/null

log "2. Outils de base"
apt_install git build-essential curl jq unzip ca-certificates gnupg locales ufw tzdata rsync

log "3. Fuseau Europe/Paris et locale fr_FR.UTF-8"
if [ "$(timedatectl show -p Timezone --value)" != "Europe/Paris" ]; then sudo timedatectl set-timezone Europe/Paris; fi
if ! locale -a | grep -qi '^fr_FR\.utf8$'; then
  sudo sed -i 's/^# *fr_FR.UTF-8 UTF-8/fr_FR.UTF-8 UTF-8/' /etc/locale.gen
  grep -q '^fr_FR.UTF-8 UTF-8' /etc/locale.gen || echo 'fr_FR.UTF-8 UTF-8' | sudo tee -a /etc/locale.gen >/dev/null
  sudo locale-gen fr_FR.UTF-8 >/dev/null
fi

log "4. Node.js ${NODE_MAJOR}.x LTS (dépôt officiel NodeSource) + pnpm (corepack)"
if [ ! -f /etc/apt/keyrings/nodesource.gpg ]; then
  sudo install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
fi
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
  | sudo tee /etc/apt/sources.list.d/nodesource.list >/dev/null
printf 'Package: nodejs\nPin: origin deb.nodesource.com\nPin-Priority: 1001\n' | sudo tee /etc/apt/preferences.d/nodesource >/dev/null
sudo apt-get update -qq
apt_install nodejs
sudo corepack enable
corepack prepare "pnpm@${PNPM_VERSION}" --activate >/dev/null

log "5. PostgreSQL (version des dépôts Ubuntu 26.04), écoute locale seulement"
apt_install postgresql postgresql-contrib
sudo systemctl enable --now postgresql >/dev/null
mkdir -p "$(dirname "$SECRETS_FILE")"; chmod 700 "$(dirname "$SECRETS_FILE")"
if [ ! -f "$SECRETS_FILE" ]; then
  ( umask 077; printf 'AWFORM_DB_PASSWORD=%s\nAWFORM_SESSION_SECRET=%s\n' \
      "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" > "$SECRETS_FILE" )
fi
# shellcheck disable=SC1090
source "$SECRETS_FILE"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_ROLE}'" | grep -q 1; then
  sudo -u postgres psql -qc "CREATE ROLE ${DB_ROLE} LOGIN"
fi
sudo -u postgres psql -qc "ALTER ROLE ${DB_ROLE} WITH LOGIN PASSWORD '${AWFORM_DB_PASSWORD}' NOSUPERUSER NOCREATEROLE CREATEDB"
for db in "${DB_NAMES[@]}"; do
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1; then
    sudo -u postgres createdb -O "${DB_ROLE}" -E UTF8 -T template0 --locale=C.UTF-8 "${db}"
  fi
done
PGCONF=$(sudo -u postgres psql -tAc 'SHOW config_file')
if ! sudo grep -qE "^listen_addresses *= *'localhost'" "$PGCONF"; then
  echo "listen_addresses = 'localhost'" | sudo tee -a "$PGCONF" >/dev/null
  sudo systemctl restart postgresql
fi

log "6. Docker Engine + plugin compose (dépôt officiel Docker)"
if [ ! -f /etc/apt/keyrings/docker.asc ]; then
  sudo install -d -m 0755 /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
fi
CODENAME=$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update -qq
apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker >/dev/null
if ! id -nG "$USER" | grep -qw docker; then sudo usermod -aG docker "$USER"; fi

log "7. Pare-feu ufw (SSH autorisé AVANT activation)"
sudo ufw default deny incoming >/dev/null
sudo ufw default allow outgoing >/dev/null
sudo ufw allow 22/tcp comment 'SSH' >/dev/null
for p in "${DEV_PORTS[@]}"; do
  sudo ufw allow from "$LAN_CIDR" to any port "$p" proto tcp comment "dev $p (LAN seulement)" >/dev/null
done
if ! sudo ufw status | grep -q '^Status: active'; then sudo ufw --force enable >/dev/null; fi

log "8. Vérifications"
fail=0
check() { if eval "$2" >/dev/null 2>&1; then printf '  OK   %s\n' "$1"; else printf '  ÉCHEC %s\n' "$1"; fail=1; fi; }
check "fuseau Europe/Paris"          '[ "$(timedatectl show -p Timezone --value)" = Europe/Paris ]'
check "locale fr_FR.UTF-8"           'locale -a | grep -qi "^fr_FR.utf8$"'
check "node ${NODE_MAJOR}.x"         'node -v | grep -q "^v${NODE_MAJOR}\."'
check "pnpm ${PNPM_VERSION}"         '[ "$(pnpm -v)" = "${PNPM_VERSION}" ]'
check "postgresql actif"             'systemctl is-active --quiet postgresql'
check "base awform_dev accessible"   'PGPASSWORD="$AWFORM_DB_PASSWORD" psql -h localhost -U awform -d awform_dev -tAc "select 1"'
check "docker actif"                 'systemctl is-active --quiet docker'
check "docker compose"               'docker compose version'
check "ufw actif, 22 autorisé"       'sudo ufw status | grep -q "^22/tcp.*ALLOW"'
echo
echo "Versions : node $(node -v) · pnpm $(pnpm -v) · $(psql --version) · $(docker --version) · $(docker compose version --short)"
echo "Secrets de développement : $SECRETS_FILE (hors dépôt)"
exit $fail
