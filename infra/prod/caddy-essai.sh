#!/usr/bin/env bash
# ESSAI LOCAL du Caddyfile avec des noms de test (aucun réseau extérieur, aucun certificat public) :
#   infra/prod/caddy-essai.sh
# Lance un Caddy jetable (conteneur, ports 18080 et 18443 de la machine) avec le VRAI Caddyfile en mode production :
#   nom canonique  awzid.test     ; alias  www.awzid.test  et  app.awzid.test  → 301 vers le nom canonique ;
#   HTTP → HTTPS (308) ; HSTS court (300 s), sans preload ni includeSubDomains ; noindex ; robots.txt strict ; pas de sitemap.
# Certificats : autorité interne de Caddy (tls_interne) — en production, Let's Encrypt par nom (tls_public). Les applications
# (web, api) ne tournent pas ici : seuls les chemins servis par Caddy lui-même sont vérifiés. Code de sortie 1 au premier écart.
set -uo pipefail
PROD="$(cd "$(dirname "$0")" && pwd)"
CTN="awzid-caddy-essai-$$"
BAD=0
ok() { printf '  ok      %s\n' "$*"; }
ko() { printf '  ÉCHEC   %s\n' "$*"; BAD=1; }
cleanup() { docker rm -f "$CTN" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$CTN" -p 127.0.0.1:18080:80 -p 127.0.0.1:18443:443 \
  -v "$PROD/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$PROD/maintenance:/srv/maintenance:ro" \
  -e SITE=awzid.test -e SITE_ALIAS_1=www.awzid.test -e SITE_ALIAS_2=app.awzid.test \
  -e AWFORM_TLS=tls_interne -e AWFORM_HTTP=rediriger -e AWFORM_HSTS_SECONDES=300 -e DEFAULT_SNI=awzid.test \
  caddy:2 >/dev/null || { echo "Docker indisponible"; exit 2; }
for i in $(seq 1 30); do
  curl -sk --max-time 2 --resolve awzid.test:18443:127.0.0.1 https://awzid.test:18443/robots.txt >/dev/null 2>&1 && break
  [ "$i" = 30 ] && { echo "Caddy ne démarre pas"; docker logs "$CTN" | tail -5; exit 1; }
  sleep 1
done
R=(--resolve awzid.test:18443:127.0.0.1 --resolve www.awzid.test:18443:127.0.0.1 --resolve app.awzid.test:18443:127.0.0.1
   --resolve awzid.test:18080:127.0.0.1 --resolve www.awzid.test:18080:127.0.0.1 --resolve app.awzid.test:18080:127.0.0.1)
loc() { curl -sk -o /dev/null -D - "${R[@]}" "$@" | tr -d '\r' | awk 'tolower($1)=="location:" {print $2}'; }
cod() { curl -sk -o /dev/null -w '%{http_code}' "${R[@]}" "$@"; }
hdr() { curl -sk -o /dev/null -D - "${R[@]}" "$@" | tr -d '\r'; }

echo "== alias → nom canonique (301, chemin et paramètres conservés)"
for h in www.awzid.test app.awzid.test; do
  [ "$(cod "https://$h:18443/lecons/en1.l01?x=1")" = 301 ] && ok "https://$h → 301" || ko "https://$h pas en 301"
  [ "$(loc "https://$h:18443/lecons/en1.l01?x=1")" = "https://awzid.test/lecons/en1.l01?x=1" ] && ok "Location canonique ($h)" || ko "Location de $h : $(loc "https://$h:18443/lecons/en1.l01?x=1")"
  [ "$(cod "http://$h:18080/a")" = 301 ] && [ "$(loc "http://$h:18080/a")" = "https://awzid.test/a" ] && ok "http://$h → 301 direct vers le canonique" || ko "http://$h : $(cod "http://$h:18080/a") $(loc "http://$h:18080/a")"
done
echo "== nom canonique"
[ "$(cod http://awzid.test:18080/x)" = 308 ] && ok "http://awzid.test → HTTPS (308)" || ko "pas de redirection HTTPS"
echo "== en-têtes (canonique et alias)"
for u in https://awzid.test:18443/robots.txt https://www.awzid.test:18443/ ; do
  H="$(hdr "$u")"
  echo "$H" | grep -qi '^strict-transport-security: max-age=300$' && ok "HSTS court (300 s) : $u" || ko "HSTS : $u : $(echo "$H" | grep -i strict)"
  echo "$H" | grep -qiE 'includesubdomains|preload' && ko "HSTS avec includeSubDomains ou preload" || ok "ni includeSubDomains ni preload"
  echo "$H" | grep -qi '^x-robots-tag: noindex' && ok "X-Robots-Tag noindex : $u" || ko "noindex absent : $u"
done
echo "== invisibilité servie par Caddy"
[ "$(curl -sk "${R[@]}" https://awzid.test:18443/robots.txt)" = "$(printf 'User-agent: *\nDisallow: /')" ] && ok "robots.txt strict" || ko "robots.txt"
[ "$(cod https://awzid.test:18443/sitemap.xml)" = 404 ] && ok "sitemap.xml : 404" || ko "sitemap servi"
echo
[ "$BAD" = 0 ] && echo "Caddyfile : essai local OK" || echo "Caddyfile : ÉCHEC"
exit "$BAD"
