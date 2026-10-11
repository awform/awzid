#!/usr/bin/env bash
# Certificat HTTPS Let's Encrypt fourni par Tailscale pour le nom *.ts.net de la machine de démonstration.
#   ts-cert.sh <nom.ts.net>   (idempotent ; lancé par deploy.sh --ts-name et chaque semaine, EXPLOITATION § 15)
# Écrit ~/.config/awform/tsnet/{ts.crt,ts.key,ts.caddy} ; Caddy les lit en lecture seule. Si le certificat a été
# renouvelé, Caddy est redémarré (admin désactivé : pas de rechargement à chaud).
set -euo pipefail
NAME="${1:?usage : ts-cert.sh <nom.ts.net>}"
case "$NAME" in *.ts.net) ;; *) echo "nom Tailscale invalide : $NAME"; exit 2 ;; esac
case "$NAME" in *[!a-z0-9.-]* | .* | *..*) echo "nom Tailscale invalide : $NAME"; exit 2 ;; esac
PROD="$(cd "$(dirname "$0")" && pwd)"
CONF="$HOME/.config/awform"
DIR="$CONF/tsnet"
mkdir -p "$DIR"
before="$(sha256sum "$DIR/ts.crt" 2>/dev/null | cut -d' ' -f1 || true)"
sudo -n tailscale cert --cert-file "$DIR/ts.crt" --key-file "$DIR/ts.key" "$NAME"
after="$(sha256sum "$DIR/ts.crt" | cut -d' ' -f1)"
cat > "$DIR/ts.caddy" <<EOF
http://$NAME {
	import awform
}
https://$NAME {
	tls /etc/caddy/tsnet/ts.crt /etc/caddy/tsnet/ts.key
	header Strict-Transport-Security "max-age=31536000"
	import awform
}
EOF
if [ "$before" != "$after" ] && [ -n "$before" ] && [ -n "$(docker ps -q -f name=awform-caddy-1)" ]; then
  AWFORM_ENV_DIR="$CONF" docker compose -f "$PROD/compose.yml" restart caddy
  echo "certificat renouvelé, Caddy redémarré"
fi
echo "certificat Tailscale prêt : $NAME ($(openssl x509 -in "$DIR/ts.crt" -noout -enddate))"
