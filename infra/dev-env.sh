#!/usr/bin/env bash
# Écrit le fichier .env (ignoré par git) à partir des secrets de développement générés par provision.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRETS_FILE="$HOME/.config/awform/dev.env"
[ -f "$SECRETS_FILE" ] || { echo "Absent : $SECRETS_FILE (lancer infra/provision.sh)"; exit 1; }
# shellcheck disable=SC1090
source "$SECRETS_FILE"
umask 077
cat > "$ROOT/.env" <<EOF
DATABASE_URL=postgres://awform:${AWFORM_DB_PASSWORD}@localhost:5432/awform_dev
TEST_DATABASE_URL=postgres://awform:${AWFORM_DB_PASSWORD}@localhost:5432/awform_test
AWFORM_CONTENT_DIR=$HOME/awform-content
AWFORM_EDITION=dev
API_HOST=127.0.0.1
API_PORT=3000
API_URL=http://127.0.0.1:3000
# cookie de session « Secure » (les navigateurs l'acceptent aussi sur localhost/127.0.0.1)
COOKIE_SECURE=1
# clé de chiffrement des secrets de second facteur (générée sur la VM, jamais versionnée)
AWFORM_SECRET_KEY=${AWFORM_SECRET_KEY}
EOF
echo ".env écrit ($ROOT/.env, droits 600)"
