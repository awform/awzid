#!/usr/bin/env bash
# Déploiement AWFORM (idempotent : peut être relancé à volonté).
#   infra/prod/deploy.sh [--demo | --production] [--site 192.168.50.10] [--lan-ip 192.168.1.106]
# --production (domaine public) : HTTP redirigé vers HTTPS, cookie toujours « Secure » (audit SEC-7) ;
# sans lui : réseau local (HTTP servi sur l'adresse IP).
# 1. secrets générés sur la machine (une seule fois) dans ~/.config/awform/prod.env (droits 600, hors dépôt) ;
# 2. images construites, base migrée, édition de contenu importée et publiée (inchangée si déjà là) ;
# 3. services démarrés, attente de l'état « ok », vérifications de fumée ;
# 4. démarrage automatique (systemd) et sauvegarde chiffrée chaque nuit ;
# 5. --demo : données fictives et identifiants de démonstration (fichier ~/.config/awform/demo-acces.json).
# N'expose rien sur Internet : le pare-feu n'ouvre 80/443 qu'au réseau local (LAN).
# Essais (instance jetable, CI, conteneur cloud) : AWFORM_DEPLOY_BUILD=0 réutilise les images déjà construites
# (awform/*:<version>) ; AWFORM_DEPLOY_SYSTEME=0 ne touche ni à systemd ni au pare-feu. Défaut : 1 et 1.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROD="$ROOT/infra/prod"
CONF="$HOME/.config/awform"
ENVF="$CONF/prod.env"
DEMO=0
PRODUCTION=0
SITE="192.168.50.10"
SITE_LAN=""
RELAIS_DOMAINE=""
LAN="192.168.50.0/24"
while [ $# -gt 0 ]; do
  case "$1" in
    --demo) DEMO=1 ;;
    --production) PRODUCTION=1 ;;
    --site) SITE="$2"; shift ;;
    --lan) LAN="$2"; shift ;;
    --lan-ip) SITE_LAN="$2"; shift ;;
    # relais d'école (lot 17) : domaine des sous-domaines des écoles, ex. relais.awzid.org
    --relais-domaine) RELAIS_DOMAINE="$2"; shift ;;
    *) echo "option inconnue : $1"; exit 2 ;;
  esac
  shift
done
[ "$DEMO$PRODUCTION" = 11 ] && { echo "--demo et --production sont incompatibles"; exit 2; }
umask 077
mkdir -p "$CONF"
rnd() { openssl rand -hex "$1"; }

# ---------------------------------------------------------------- 1. secrets (une seule fois)
if [ ! -f "$ENVF" ]; then
  PGPW="$(rnd 24)"
  cat > "$ENVF" <<EOF
# AWFORM — secrets de cette machine (générés le $(date -Iseconds)). NE JAMAIS versionner ni copier ailleurs.
POSTGRES_PASSWORD=$PGPW
DATABASE_URL=postgres://awform:$PGPW@db:5432/awform
AWFORM_SECRET_KEY=$(rnd 32)
SITE=$SITE
TZ=Europe/Paris
EOF
  echo "secrets générés : $ENVF"
fi
grep -q '^SITE=' "$ENVF" && sed -i "s/^SITE=.*/SITE=$SITE/" "$ENVF"
# accès depuis les appareils du Wi-Fi par le PC (redirection de port) : certificat aussi pour cette IP
sed -i '/^SITE_LAN=/d;/^DEFAULT_SNI=/d' "$ENVF"
if [ -n "$SITE_LAN" ]; then echo "SITE_LAN=$SITE_LAN" >> "$ENVF"; echo "DEFAULT_SNI=$SITE_LAN" >> "$ENVF"; else echo "DEFAULT_SNI=$SITE" >> "$ENVF"; fi
if [ -n "$RELAIS_DOMAINE" ]; then
  case "$RELAIS_DOMAINE" in *[!a-z0-9.-]* | .* | *.) echo "domaine des relais invalide : $RELAIS_DOMAINE"; exit 2 ;; esac
  sed -i '/^RELAIS_DOMAINE=/d' "$ENVF"
  echo "RELAIS_DOMAINE=$RELAIS_DOMAINE" >> "$ENVF"
fi
# comptes PostgreSQL séparés (lot 14) : mots de passe générés une fois, URL de chaque service recalculées
for k in AWFORM_DB_API_PASSWORD AWFORM_DB_WORKER_PASSWORD; do
  grep -q "^$k=" "$ENVF" || echo "$k=$(rnd 24)" >> "$ENVF"
done
sed -i '/^DATABASE_URL_API=/d;/^DATABASE_URL_WORKER=/d' "$ENVF"
# (mots de passe lus AVANT d'écrire dans le même fichier)
PW_API="$(grep '^AWFORM_DB_API_PASSWORD=' "$ENVF" | cut -d= -f2-)"
PW_WORKER="$(grep '^AWFORM_DB_WORKER_PASSWORD=' "$ENVF" | cut -d= -f2-)"
{
  echo "DATABASE_URL_API=postgres://awform_api:$PW_API@db:5432/awform"
  echo "DATABASE_URL_WORKER=postgres://awform_worker:$PW_WORKER@db:5432/awform"
} >> "$ENVF"
# lot 16 : clé de chiffrement des récitations envoyées (API seulement) et clés VAPID des notifications
# (publique : API et travailleur ; PRIVÉE : travailleur seulement) — générées une fois, jamais versionnées
grep -q '^AWFORM_RECITATION_KEY=' "$ENVF" || echo "AWFORM_RECITATION_KEY=v1:$(rnd 32)" >> "$ENVF"
# signature des certificats (lot 20) : graine Ed25519, jamais hors du périmètre de l'API ; la changer rend
# « invalide » la signature des certificats déjà délivrés (garder l'ancienne dans le coffre du client)
grep -q '^AWFORM_CERT_SIGN_KEY=' "$ENVF" || echo "AWFORM_CERT_SIGN_KEY=v1:$(rnd 32)" >> "$ENVF"
# messagerie encadrée (lot 21) : clé de chiffrement des messages et pièces jointes (API seulement)
grep -q '^AWFORM_MESSAGE_KEY=' "$ENVF" || echo "AWFORM_MESSAGE_KEY=v1:$(rnd 32)" >> "$ENVF"
if ! grep -q '^AWFORM_VAPID_PRIVATE=' "$ENVF"; then
  VK="$(mktemp)"
  openssl ecparam -name prime256v1 -genkey -noout -out "$VK"
  b64u() { base64 -w0 | tr '+/' '-_' | tr -d '='; }
  echo "AWFORM_VAPID_PRIVATE=$(openssl ec -in "$VK" -outform DER 2>/dev/null | tail -c +8 | head -c 32 | b64u)" >> "$ENVF"
  echo "AWFORM_VAPID_PUBLIC=$(openssl ec -in "$VK" -pubout -outform DER 2>/dev/null | tail -c 65 | b64u)" >> "$ENVF"
  shred -u "$VK"
fi
sed -i '/^AWFORM_VAPID_SUBJECT=/d' "$ENVF"
echo "AWFORM_VAPID_SUBJECT=https://$SITE" >> "$ENVF"
# tuteur et paiements : désactivés par défaut ; la démonstration utilise les fournisseurs SIMULÉS (jamais un
# vrai modèle, aucune clé, aucune carte) et montre les langues en préparation ; sans --demo, ces réglages de
# démonstration sont RETIRÉS (audit INF-9)
"$PROD/demo-env.sh" "$ENVF" "$DEMO"
# exposition : production (redirection HTTPS, cookie Secure) ou réseau local (audit SEC-7)
"$PROD/mode-env.sh" "$ENVF" "$PRODUCTION"
# moindre privilège : un fichier par service (env-scopes.conf) ; prod.env n'est monté dans aucun conteneur
export AWFORM_ENV_DIR="$CONF"
"$PROD/env-split.sh" "$ENVF" "$CONF"
export AWFORM_CONTENT_DIR="${AWFORM_CONTENT_DIR:-$HOME/awform-content}"
AWFORM_VERSION="${AWFORM_VERSION:-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)}"
export AWFORM_VERSION
DC=(docker compose -f "$PROD/compose.yml")

# clés des sauvegardes : publique sur le serveur, PRIVÉE à emporter hors de la machine (infra/pc/recuperer-cle-sauvegarde.ps1)
"$PROD/backup-keygen.sh"
[ -e "$CONF/A-EMPORTER-backup-private.asc" ] && echo "ATTENTION : clé privée des sauvegardes à emporter hors du serveur (infra/pc/recuperer-cle-sauvegarde.ps1)"

# ---------------------------------------------------------------- 2. images, base, contenu
[ "${AWFORM_DEPLOY_BUILD:-1}" = 0 ] || "${DC[@]}" build --pull
"${DC[@]}" up -d db
# audit INF-10 : SAUVEGARDE juste avant toute migration (les migrations n'ont pas de retour arrière)
for i in $(seq 1 30); do
  "${DC[@]}" exec -T db pg_isready -U awform -d awform >/dev/null 2>&1 && break
  [ "$i" = 30 ] && { echo "ÉCHEC : la base ne répond pas"; exit 1; }
  sleep 2
done
"$PROD/backup.sh" >/dev/null || { echo "ÉCHEC : sauvegarde avant migration — déploiement arrêté"; exit 1; }
"${DC[@]}" --profile outils run --rm migrate
# audio du Coran (A1) : le volume « audio », créé vide par Docker (propriétaire root), doit appartenir au
# compte « node » de l'outil coran-audio pour l'import ; idempotent (l'API le monte en lecture seule)
"${DC[@]}" --profile outils run --rm -T --user root --entrypoint chown coran-audio node:node /audio
# comptes de l'API et du travailleur (idempotent : droits recalculés à chaque déploiement)
"${DC[@]}" --profile outils run --rm roles
# livres GELÉS publiés (AWFORM_LEVELS) ; démonstration : livres en relecture en « aperçu » (AWFORM_APERCU)
LEVELS="${AWFORM_LEVELS:-en1,en2,en3,en4,en5,ad1,ad2,ad3,ad4,ad5,ad6,ad7,ad8,ad9,ad10,ado1,ado2,ado3,ado4,re1,re2,re3,re4,re5,ra1,ra2,ra3,ra4,qc1,qc2,qc3}"
APERCU="${AWFORM_APERCU:-}"
# carnets de hifẓ gelés (audités) : E1-E5, N1-N5 (lot 28)
CARNETS="${AWFORM_CARNETS:-en1,en2,en3,en4,en5,ad1,ad2,ad3,ad4,ad5}"
# (lot 16 : ra1 et ra2 sont gelés, publiés normalement ; plus d'aperçu par défaut)
# (lot 28 : 31 livres gelés ; Guide des parents « gp » et Manuel du formateur « mf » ne sont pas des livres d'élève)
EDITION="prod-$( (cat "$AWFORM_CONTENT_DIR/MANIFEST.sha256"; echo "$LEVELS|$CARNETS|$APERCU|$AWFORM_VERSION") | sha256sum | cut -c1-10)"
IMPORT_ARGS=(--edition "$EDITION" --levels "$LEVELS" --carnets "$CARNETS" --publish)
[ -n "$APERCU" ] && IMPORT_ARGS+=(--apercu "$APERCU")
"${DC[@]}" --profile outils run --rm import "${IMPORT_ARGS[@]}"

# ---------------------------------------------------------------- 3. services
"${DC[@]}" up -d --remove-orphans api worker web caddy
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1/api/v1/health" 2>/dev/null | grep -q '"status":"ok"'; then break; fi
  if [ "$i" = 60 ]; then
    echo "ÉCHEC : l'API ne répond pas"
    "${DC[@]}" ps
    # audit INF-10 : retour aux images de la version précédente (la base migrée reste : les migrations
    # suivent la règle « expand / contract », compatibles avec la version précédente — EXPLOITATION.md)
    PREV="$(cat "$CONF/version-en-service" 2>/dev/null || true)"
    if [ -n "$PREV" ] && [ "$PREV" != "$AWFORM_VERSION" ]; then
      echo "retour à la version précédente : $PREV"
      AWFORM_VERSION="$PREV" "${DC[@]}" up -d --remove-orphans api worker web caddy
    fi
    exit 1
  fi
  sleep 2
done
echo "santé : ok ($(curl -fsS http://127.0.0.1/api/v1/health))"
# version en service (retour possible au prochain déploiement en échec)
echo "$AWFORM_VERSION" > "$CONF/version-en-service"
# aucun secret hors de son périmètre dans les conteneurs démarrés (noms des variables seulement)
"$PROD/env-check.sh" "$ENVF"

# ---------------------------------------------------------------- 4. démarrage automatique et sauvegarde nocturne
if [ "${AWFORM_DEPLOY_SYSTEME:-1}" = 1 ]; then
sudo tee /etc/systemd/system/awform.service >/dev/null <<EOF
[Unit]
Description=AWFORM (Docker Compose)
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=$USER
Environment=AWFORM_ENV_DIR=$AWFORM_ENV_DIR
Environment=AWFORM_VERSION=$AWFORM_VERSION
WorkingDirectory=$PROD
ExecStart=/usr/bin/docker compose -f $PROD/compose.yml up -d db api worker web caddy
ExecStop=/usr/bin/docker compose -f $PROD/compose.yml stop

[Install]
WantedBy=multi-user.target
EOF
sudo tee /etc/systemd/system/awform-backup.service >/dev/null <<EOF
[Unit]
Description=AWFORM — sauvegarde chiffrée de la base
After=awform.service

[Service]
Type=oneshot
User=$USER
Environment=AWFORM_ENV_DIR=$AWFORM_ENV_DIR
# copie hors site (audit INF-8) : AWFORM_BACKUP_HORS_SITE=… dans ce fichier facultatif (aucun secret)
EnvironmentFile=-$AWFORM_ENV_DIR/backup.env
ExecStart=$PROD/backup.sh
EOF
sudo tee /etc/systemd/system/awform-backup.timer >/dev/null <<EOF
[Unit]
Description=AWFORM — sauvegarde chaque nuit (2 h 30)

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now docker >/dev/null
sudo systemctl enable awform.service awform-backup.timer >/dev/null
sudo systemctl start awform-backup.timer

# pare-feu : 80 et 443 depuis le réseau local seulement (SSH déjà autorisé)
sudo ufw allow from "$LAN" to any port 80 proto tcp >/dev/null
sudo ufw allow from "$LAN" to any port 443 proto tcp >/dev/null
fi

# ---------------------------------------------------------------- 5. démonstration
if [ "$DEMO" = 1 ]; then
  DEMOF="$CONF/demo.env"
  if [ ! -f "$DEMOF" ]; then
    cat > "$DEMOF" <<EOF
AWFORM_DEMO_PASSWORD=demo-$(rnd 6)-$(rnd 6)
AWFORM_DEMO_TAG=$(rnd 3)
AWFORM_DEMO_PIN=$(shuf -i 1000-9999 -n 1)
EOF
  fi
  # fichier de la machine (identifiants de démonstration), hors dépôt
  set -a
  # shellcheck source=/dev/null
  . "$DEMOF"
  set +a
  # l'enseignant de démonstration a un second facteur : son secret est chiffré avec la clé de l'API, donnée
  # à CETTE seule exécution (le périmètre « outils » ne la reçoit pas : moindre privilège)
  AWFORM_SECRET_KEY="$(grep '^AWFORM_SECRET_KEY=' "$ENVF" | cut -d= -f2-)"
  export AWFORM_SECRET_KEY
  OUT="$("${DC[@]}" --profile outils run --rm -T -e AWFORM_DEMO=1 -e AWFORM_DEMO_PASSWORD -e AWFORM_DEMO_TAG -e AWFORM_DEMO_PIN -e AWFORM_SECRET_KEY demo | tail -1)"
  unset AWFORM_SECRET_KEY
  if echo "$OUT" | grep -q '"demo":"creee"'; then
    echo "$OUT" > "$CONF/demo-acces.json"
    echo "démonstration créée (identifiants : $CONF/demo-acces.json)"
  elif echo "$OUT" | grep -q '"demo":"complement"'; then
    echo "$OUT" > "$CONF/demo-acces-complement-$(date +%Y%m%d%H%M%S).json"
    echo "démonstration complétée (identifiants ajoutés : $CONF/demo-acces-complement-*.json)"
  else
    echo "démonstration déjà présente"
  fi
fi

# ---------------------------------------------------------------- 6. vérifications de fumée
"$PROD/smoke.sh" "http://127.0.0.1"
echo "Déployé : http://$SITE  (https://$SITE avec l'autorité locale de Caddy)"
