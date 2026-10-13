#!/usr/bin/env bash
# CONTRÔLE DES EN-TÊTES DE SÉCURITÉ ET DE L'INVISIBILITÉ d'une adresse (lecture seule, rien n'est modifié) :
#   infra/prod/entetes-check.sh https://awzid.com     (ou http://127.0.0.1 sur la machine)
# Vérifie : politique de sécurité du contenu, nosniff, Referrer-Policy, interdiction des cadres, Permissions-Policy,
# isolation d'origine, HSTS (en HTTPS), X-Robots-Tag « noindex », robots.txt strict, aucun sitemap, aucun en-tête
# « Server », aucune balise d'aperçu social (Open Graph, Twitter) dans la page. Code de sortie 1 au premier écart.
set -uo pipefail
BASE="${1:?adresse à contrôler, ex. https://awzid.com}"
BASE="${BASE%/}"
BAD=0
ok() { printf '  ok      %s\n' "$*"; }
ko() { printf '  ÉCHEC   %s\n' "$*"; BAD=1; }
H="$(curl -sSI --max-time 15 "$BASE/" 2>/dev/null | tr -d '\r')" || { echo "adresse injoignable : $BASE"; exit 1; }
[ -n "$H" ] || { echo "aucune réponse de $BASE"; exit 1; }
has() { printf '%s\n' "$H" | grep -qi "$1"; }
echo "== en-têtes de $BASE/"
has '^content-security-policy:.*frame-ancestors' && ok "Content-Security-Policy (frame-ancestors)" || ko "Content-Security-Policy absente"
has '^content-security-policy:.*default-src' && ok "CSP : default-src" || ko "CSP sans default-src"
has '^x-content-type-options: *nosniff' && ok "X-Content-Type-Options: nosniff" || ko "X-Content-Type-Options"
has '^referrer-policy: *no-referrer' && ok "Referrer-Policy: no-referrer" || ko "Referrer-Policy"
has '^permissions-policy:' && ok "Permissions-Policy" || ko "Permissions-Policy"
has '^cross-origin-opener-policy: *same-origin' && ok "Cross-Origin-Opener-Policy" || ko "Cross-Origin-Opener-Policy"
(has '^x-frame-options: *deny' || has 'frame-ancestors') && ok "interdiction des cadres" || ko "cadres non interdits"
has '^x-robots-tag:.*noindex' && ok "X-Robots-Tag: noindex" || ko "X-Robots-Tag noindex absent"
if has '^server:'; then ko "en-tête Server présent ($(printf '%s\n' "$H" | grep -i '^server:'))"; else ok "pas d'en-tête Server"; fi
case "$BASE" in https://*) has '^strict-transport-security:.*max-age=' && ok "HSTS" || ko "HSTS absent" ;; esac
echo "== invisibilité"
R="$(curl -fsS --max-time 15 "$BASE/robots.txt" 2>/dev/null || true)"
[ "$R" = "$(printf 'User-agent: *\nDisallow: /')" ] && ok "robots.txt : tout interdit" || ko "robots.txt non strict"
for s in sitemap.xml sitemap_index.xml; do
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/$s")" = 404 ] && ok "$s : 404" || ko "$s servi"
done
P="$(curl -fsS --max-time 15 "$BASE/" 2>/dev/null || true)"
printf '%s' "$P" | grep -qi '<meta name="robots" content="noindex' && ok "balise robots noindex" || ko "balise robots noindex absente"
if printf '%s' "$P" | grep -qiE 'property="og:|name="twitter:'; then ko "balise d'aperçu social présente"; else ok "aucun aperçu social"; fi
echo "== sonde"
curl -fsS --max-time 15 "$BASE/healthz" 2>/dev/null | grep -q '"status":"ok"' && ok "/healthz" || ko "/healthz"
exit "$BAD"
