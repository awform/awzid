#!/usr/bin/env bash
# Vérifications de fumée après déploiement : santé, application, page du QR, en-têtes de sécurité.
#   infra/prod/smoke.sh [http://127.0.0.1]
set -euo pipefail
BASE="${1:-http://127.0.0.1}"
fail() { echo "ÉCHEC : $*"; exit 1; }
curl -fsS "$BASE/api/v1/health" | grep -q '"status":"ok"' || fail "santé de l'API"
curl -fsS "$BASE/api/v1/health" | grep -q '"db":true' || fail "base de données"
curl -fsS "$BASE/api/v1/levels" | grep -q '"en1"' || fail "édition publiée (niveaux)"
curl -fsS "$BASE/" | grep -qi '<!doctype html' || fail "application web"
QR="$(curl -fsS "$BASE/l/en1-05")"
echo "$QR" | grep -q 'lecons/en1.l05' || fail "page du QR code"
[ "$(printf '%s' "$QR" | wc -c)" -lt 100000 ] || fail "page du QR trop lourde"
curl -fsSI "$BASE/" | grep -qi 'content-security-policy' || fail "politique de sécurité du contenu"
curl -fsSI "$BASE/" | grep -qi 'x-content-type-options: nosniff' || fail "en-têtes de sécurité"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/auth/login" -H 'content-type: application/json' -d '{}')" = 403 ] \
  || fail "protection CSRF"
echo "fumée : ok ($BASE)"
