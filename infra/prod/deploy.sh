#!/usr/bin/env bash
# Déploiement AWFORM (idempotent : peut être relancé à volonté).
#   infra/prod/deploy.sh [--demo] [--site 192.168.50.10] [--lan-ip 192.168.1.106]
# 1. secrets générés sur la machine (une seule fois) dans ~/.config/awform/prod.env (droits 600, hors dépôt) ;
# 2. images construites, base migrée, édition de contenu importée et publiée (inchangée si déjà là) ;
# 3. services démarrés, attente de l'état « ok », vérifications de fumée ;
# 4. démarrage automatique (systemd) et sauvegarde chiffrée chaque nuit ;
# 5. --demo : données fictives et identifiants de démonstration (fichier ~/.config/awform/demo-acces.json).
# N'expose rien sur Internet : le pare-feu n'ouvre 80/443 qu'au réseau local (LAN).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROD="$ROOT/infra/prod"
CONF="$HOME/.config/awform"
ENVF="$CONF/prod.env"
DEMO=0
SITE="192.168.50.10"
SITE_LAN=""
LAN="192.168.50.0/24"
while [ $# -gt 0 ]; do
  case "$1" in
    --demo) DEMO=1 ;;
    --site) SITE="$2"; shift ;;
    --lan) LAN="$2"; shift ;;
    --lan-ip) SITE_LAN="$2"; shift ;;
    *) echo "option inconnue : $1"; exit 2 ;;
  esac
  shift
done
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
COOKIE_SECURE=auto
SITE=$SITE
TZ=Europe/Paris
EOF
  echo "secrets générés : $ENVF"
fi
grep -q '^SITE=' "$ENVF" && sed -i "s/^SITE=.*/SITE=$SITE/" "$ENVF"
# accès depuis les appareils du Wi-Fi par le PC (redirection de port) : certificat aussi pour cette IP
sed -i '/^SITE_LAN=/d;/^DEFAULT_SNI=/d' "$ENVF"
if [ -n "$SITE_LAN" ]; then echo "SITE_LAN=$SITE_LAN" >> "$ENVF"; echo "DEFAULT_SNI=$SITE_LAN" >> "$ENVF"; else echo "DEFAULT_SNI=$SITE" >> "$ENVF"; fi
# tuteur : désactivé par défaut ; la démonstration utilise le fournisseur SIMULÉ (jamais un vrai modèle)
if [ "$DEMO" = 1 ] && ! grep -q '^AWFORM_TUTEUR=' "$ENVF"; then echo "AWFORM_TUTEUR=simule" >> "$ENVF"; fi
# paiements : désactivés par défaut ; la démonstration utilise le prestataire SIMULÉ (aucune clé, aucune carte)
if [ "$DEMO" = 1 ] && ! grep -q '^AWFORM_PAIEMENT=' "$ENVF"; then echo "AWFORM_PAIEMENT=simule" >> "$ENVF"; fi
export AWFORM_ENV_FILE="$ENVF"
export AWFORM_CONTENT_DIR="${AWFORM_CONTENT_DIR:-$HOME/awform-content}"
export AWFORM_VERSION="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)"
DC=(docker compose -f "$PROD/compose.yml")

# ---------------------------------------------------------------- 2. images, base, contenu
"${DC[@]}" build --pull
"${DC[@]}" up -d db
"${DC[@]}" --profile outils run --rm migrate
# livres GELÉS publiés (AWFORM_LEVELS) ; démonstration : livres en relecture en « aperçu » (AWFORM_APERCU)
LEVELS="${AWFORM_LEVELS:-en1,ad1,en2,ad2,re1,re2}"
APERCU="${AWFORM_APERCU:-}"
[ "$DEMO" = 1 ] && [ -z "${AWFORM_APERCU+x}" ] && APERCU="ra1,ra2"
EDITION="prod-$( (cat "$AWFORM_CONTENT_DIR/MANIFEST.sha256"; echo "$LEVELS|$APERCU|$AWFORM_VERSION") | sha256sum | cut -c1-10)"
IMPORT_ARGS=(--edition "$EDITION" --levels "$LEVELS" --publish)
[ -n "$APERCU" ] && IMPORT_ARGS+=(--apercu "$APERCU")
"${DC[@]}" --profile outils run --rm import "${IMPORT_ARGS[@]}"

# ---------------------------------------------------------------- 3. services
"${DC[@]}" up -d --remove-orphans api worker web caddy
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1/api/v1/health" 2>/dev/null | grep -q '"status":"ok"'; then break; fi
  [ "$i" = 60 ] && { echo "ÉCHEC : l'API ne répond pas"; "${DC[@]}" ps; exit 1; }
  sleep 2
done
echo "santé : ok ($(curl -fsS http://127.0.0.1/api/v1/health))"

# ---------------------------------------------------------------- 4. démarrage automatique et sauvegarde nocturne
sudo tee /etc/systemd/system/awform.service >/dev/null <<EOF
[Unit]
Description=AWFORM (Docker Compose)
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=$USER
Environment=AWFORM_ENV_FILE=$ENVF
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
Environment=AWFORM_ENV_FILE=$ENVF
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
  set -a; . "$DEMOF"; set +a
  OUT="$("${DC[@]}" run --rm -T -e AWFORM_DEMO=1 -e AWFORM_DEMO_PASSWORD -e AWFORM_DEMO_TAG -e AWFORM_DEMO_PIN api node dist/cli/demo.js | tail -1)"
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
