#!/usr/bin/env bash
# AWFORM — installation (ou mise à jour) du relais d'école (lot 17), sur un mini-PC ou un Raspberry Pi
# (Debian, Ubuntu ou Raspberry Pi OS, 64 bits), À LANCER EN ADMINISTRATEUR depuis une copie du dépôt, avec
# Internet (une fois) :
#   sudo infra/relais/install.sh --hote ecole-dakar-01.relais.awzid.org --amont https://app.awzid.org [--dns 192.168.1.20]
# Le JETON du relais (donné par l'équipe AWFORM, créé par « relais.js creer ») est demandé au clavier (ou lu dans
# la variable AWFORM_RELAIS_JETON) : jamais en argument (il resterait dans l'historique et la liste des
# processus). Relancer le script est sans danger : la clé locale et le jeton déjà enregistrés sont gardés.
#   --dns <IP du relais>  : le relais répond aussi aux questions DNS du Wi-Fi (dnsmasq) pour le nom de l'école ;
#                           à choisir si la box ne sait pas enregistrer un nom local (voir INSTALLATION.md).
# Options de test : AWFORM_RELAIS_CONF, AWFORM_RELAIS_VAR (dossiers), AWFORM_RELAIS_SANS_SYSTEME=1 (n'écrit que les
# fichiers : ni Docker, ni systemd, ni dnsmasq).
set -euo pipefail
HOTE=""
AMONT=""
DNS_IP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --hote) HOTE="${2:-}"; shift ;;
    --amont) AMONT="${2:-}"; shift ;;
    --dns) DNS_IP="${2:-}"; shift ;;
    --jeton*) echo "Le jeton ne se donne jamais en argument : il est demandé au clavier." >&2; exit 2 ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
  shift
done

CONF="${AWFORM_RELAIS_CONF:-/etc/awform-relais}"
VAR="${AWFORM_RELAIS_VAR:-/var/lib/awform-relais}"
SANS_SYSTEME="${AWFORM_RELAIS_SANS_SYSTEME:-0}"
ICI="$(cd "$(dirname "$0")" && pwd)"
HOTE_RE='^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'

# valeurs déjà enregistrées (relance) : gardées si l'option n'est pas redonnée
lire() { if [ -f "$1" ]; then grep -E "^$2=" "$1" | tail -1 | cut -d= -f2- || true; fi; }
[ -n "$HOTE" ] || HOTE="$(lire "$CONF/caddy.env" RELAIS_HOST)"
[ -n "$AMONT" ] || AMONT="$(lire "$CONF/relais.env" AWFORM_RELAIS_AMONT)"
[[ "$HOTE" =~ $HOTE_RE ]] || { echo "nom de l'école invalide ou absent (--hote)" >&2; exit 2; }
[[ "$AMONT" =~ ^https://[a-z0-9.-]+(:[0-9]+)?$ ]] || { echo "serveur central invalide ou absent (--amont https://…)" >&2; exit 2; }
if [ -n "$DNS_IP" ] && ! [[ "$DNS_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "adresse IP du relais invalide (--dns)" >&2; exit 2
fi

JETON="$(lire "$CONF/relais.env" AWFORM_RELAIS_JETON)"
if [ -n "${AWFORM_RELAIS_JETON:-}" ]; then JETON="$AWFORM_RELAIS_JETON"; fi
if [ -z "$JETON" ]; then
  read -r -s -p "Jeton du relais (donné par l'équipe AWFORM) : " JETON
  echo
fi
[[ "$JETON" =~ ^rel_[A-Za-z0-9_-]{20,}$ ]] || { echo "jeton invalide (il commence par rel_)" >&2; exit 2; }

umask 077
mkdir -p "$CONF" "$VAR/donnees" "$VAR/certs"

# ------------------------------------------------------------------ 1. secrets de la machine (une seule fois pour la clé)
CLE="$(lire "$CONF/relais.env" AWFORM_RELAIS_CLE)"
[ -n "$CLE" ] || CLE="$(openssl rand -hex 32)"
tmp="$(mktemp "$CONF/.relais.env.XXXXXX")"
cat > "$tmp" <<EOF
# AWFORM — relais d'école ($HOTE), écrit par install.sh le $(date -Iseconds). NE JAMAIS copier ni envoyer.
# Perdre AWFORM_RELAIS_CLE rend illisibles les envois en attente : ne pas la changer tant que la file n'est pas vide.
AWFORM_RELAIS_AMONT=$AMONT
AWFORM_RELAIS_JETON=$JETON
AWFORM_RELAIS_CLE=$CLE
EOF
chmod 600 "$tmp"
mv -f "$tmp" "$CONF/relais.env"
tmp="$(mktemp "$CONF/.caddy.env.XXXXXX")"
echo "RELAIS_HOST=$HOTE" > "$tmp"
chmod 600 "$tmp"
mv -f "$tmp" "$CONF/caddy.env"

# ------------------------------------------------------------------ 2. certificat provisoire (remplacé par celui du central)
if [ ! -s "$VAR/certs/ecole.crt" ] || [ ! -s "$VAR/certs/ecole.key" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=$HOTE" \
    -addext "subjectAltName=DNS:$HOTE" \
    -keyout "$VAR/certs/ecole.key" -out "$VAR/certs/ecole.crt" 2>/dev/null
  echo "certificat provisoire créé (le vrai arrive du serveur central au premier contact)"
fi
# le relais tourne sous le compte « node » (1000) de l'image
if [ "$(id -u)" = 0 ]; then chown -R 1000:1000 "$VAR/donnees" "$VAR/certs"; fi
chmod 700 "$VAR/donnees" "$VAR/certs"

if [ "$SANS_SYSTEME" = 1 ]; then
  echo "fichiers écrits (sans système) : $CONF, $VAR"
  exit 0
fi

# ------------------------------------------------------------------ 3. Docker, images
[ "$(id -u)" = 0 ] || { echo "à lancer en administrateur (sudo)" >&2; exit 1; }
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  apt-get update -q
  apt-get install -y -q docker.io docker-compose-v2 || apt-get install -y -q docker.io docker-compose-plugin
fi
systemctl enable --now docker
export AWFORM_RELAIS_CONF="$CONF" AWFORM_RELAIS_VAR="$VAR"
AWFORM_VERSION="$(git -C "$ICI" rev-parse --short HEAD 2>/dev/null || echo local)"
export AWFORM_VERSION
docker compose -f "$ICI/compose.yml" build
docker compose -f "$ICI/compose.yml" up -d

# ------------------------------------------------------------------ 4. démarrage automatique, rechargement du certificat
cat > /etc/systemd/system/awform-relais.service <<EOF
[Unit]
Description=Relais d'école AWFORM
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
Environment=AWFORM_RELAIS_CONF=$CONF AWFORM_RELAIS_VAR=$VAR AWFORM_VERSION=$AWFORM_VERSION
ExecStart=/usr/bin/docker compose -f $ICI/compose.yml up -d
ExecStop=/usr/bin/docker compose -f $ICI/compose.yml stop

[Install]
WantedBy=multi-user.target
EOF
# nouveau certificat écrit par le relais → Caddy le recharge, sans intervention
cat > /etc/systemd/system/awform-relais-certificat.path <<EOF
[Unit]
Description=Certificat de l'école (relais AWFORM)

[Path]
PathChanged=$VAR/certs/ecole.crt

[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/awform-relais-certificat.service <<EOF
[Unit]
Description=Rechargement du certificat de l'école (relais AWFORM)

[Service]
Type=oneshot
Environment=AWFORM_RELAIS_CONF=$CONF AWFORM_RELAIS_VAR=$VAR AWFORM_VERSION=$AWFORM_VERSION
ExecStart=/usr/bin/docker compose -f $ICI/compose.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile --force
EOF
systemctl daemon-reload
systemctl enable --now awform-relais.service awform-relais-certificat.path

# ------------------------------------------------------------------ 5. DNS du Wi-Fi (facultatif)
if [ -n "$DNS_IP" ]; then
  command -v dnsmasq >/dev/null || apt-get install -y -q dnsmasq
  cat > /etc/dnsmasq.d/awform-relais.conf <<EOF
# AWFORM : sur le Wi-Fi de l'école, le nom de l'école mène au relais ; le reste est transmis normalement
address=/$HOTE/$DNS_IP
EOF
  systemctl restart dnsmasq
  echo "DNS : $HOTE → $DNS_IP (régler la box pour donner $DNS_IP comme serveur DNS, voir INSTALLATION.md)"
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "Relais installé pour $HOTE."
echo "Page d'état pour le directeur : http://${IP:-<adresse du relais>}/relais/etat"
echo "Application pour les élèves : https://$HOTE"
