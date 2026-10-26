#!/usr/bin/env bash
# ESSAI LOCAL du Caddyfile avec des noms de test (aucun réseau extérieur, aucun certificat public) :
#   infra/prod/caddy-essai.sh
# Lance un Caddy jetable (conteneur, ports 18080 et 18443 de la machine) avec le VRAI Caddyfile en mode production :
#   nom canonique  awzid.test     ; alias  www.awzid.test  et  app.awzid.test  → 301 vers le nom canonique ;
#   HTTP → HTTPS (308) ; HSTS court (300 s), sans preload ni includeSubDomains ; noindex ; robots.txt strict ; pas de sitemap ;
#   alias de SECTIONS (arabe, quran, fiqh, fikh, adab, akhlaq) : désactivés par défaut, puis activés par alias-sections.sh et
#   pris en compte par un redémarrage du seul Caddy : 301 vers /, /coran, /madjaliss, /vivre.
# Certificats : autorité interne de Caddy (tls_interne) — en production, Let's Encrypt par nom (tls_public). Les applications
# (web, api) ne tournent pas ici : seuls les chemins servis par Caddy lui-même sont vérifiés. Code de sortie 1 au premier écart.
set -uo pipefail
PROD="$(cd "$(dirname "$0")" && pwd)"
# Les ports 18080 et 18443 de la machine sont FIXES : deux essais en même temps (deux dossiers de travail, une suite de tests
# et un essai à la main) se les disputent et le second échouait avec un « Docker indisponible » trompeur. Verrou commun :
# le second attend (2 min au plus) que le premier ait fini ; si les ports sont tenus par autre chose, le message le dit.
if command -v flock >/dev/null 2>&1; then
  exec 9>"${TMPDIR:-/tmp}/awzid-caddy-essai.lock"
  flock -w 120 9 || { echo "Un autre essai Caddy tient les ports 18080/18443 depuis plus de 2 minutes"; exit 2; }
fi
CTN="awzid-caddy-essai-$$"
FAUX="awzid-caddy-faux-$$"
NET="awzid-caddy-net-$$"
BAD=0
ok() { printf '  ok      %s\n' "$*"; }
ko() { printf '  ÉCHEC   %s\n' "$*"; BAD=1; }
ALIAS_DIR="$(mktemp -d)"
cleanup() {
  docker rm -f "$CTN" "$FAUX" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  find "$ALIAS_DIR" -delete 2>/dev/null || true
}
trap cleanup EXIT
# alias de sections : DÉSACTIVÉS par défaut (dossier vide), activés plus bas par alias-sections.sh
mkdir -p "$ALIAS_DIR/alias"
echo "SITE=awzid.test" > "$ALIAS_DIR/caddy.env"
# faux amont « web » et « api » (réponse fixe sur le port 3000) : les en-têtes de Caddy se contrôlent sur des réponses 200
# (sur une erreur 502 de passerelle, la page de maintenance remplace la réponse et ses en-têtes)
docker network create "$NET" >/dev/null 2>&1 || { echo "Docker indisponible"; exit 2; }
docker run -d --name "$FAUX" --network "$NET" --network-alias web --network-alias api caddy:2 caddy respond --listen :3000 --body ok >/dev/null || { echo "Docker indisponible"; exit 2; }
docker run -d --name "$CTN" --network "$NET" -p 127.0.0.1:18080:80 -p 127.0.0.1:18443:443 \
  -v "$PROD/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$PROD/maintenance:/srv/maintenance:ro" \
  -v "$ALIAS_DIR/alias:/etc/caddy/alias:ro" \
  -e SITE=awzid.test -e SITE_ALIAS_1=www.awzid.test -e SITE_ALIAS_2=app.awzid.test \
  -e AWFORM_TLS=tls_interne -e AWFORM_HTTP=rediriger -e AWFORM_HSTS_SECONDES=300 -e DEFAULT_SNI=awzid.test \
  caddy:2 >/dev/null || { echo "Caddy d'essai non démarré : Docker indisponible, ou ports 18080/18443 déjà tenus par un autre processus"; exit 2; }
for i in $(seq 1 30); do
  curl -sk --max-time 2 --resolve awzid.test:18443:127.0.0.1 https://awzid.test:18443/robots.txt >/dev/null 2>&1 && break
  [ "$i" = 30 ] && { echo "Caddy ne démarre pas"; docker logs "$CTN" | tail -5; exit 1; }
  sleep 1
done
R=()
for h in awzid.test www.awzid.test app.awzid.test arabe.awzid.test quran.awzid.test fiqh.awzid.test fikh.awzid.test adab.awzid.test akhlaq.awzid.test; do
  R+=(--resolve "$h:18443:127.0.0.1" --resolve "$h:18080:127.0.0.1")
done
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
for u in https://awzid.test:18443/robots.txt https://www.awzid.test:18443/; do
  H="$(hdr "$u")"
  echo "$H" | grep -qi '^strict-transport-security: max-age=300$' && ok "HSTS court (300 s) : $u" || ko "HSTS : $u : $(echo "$H" | grep -i strict)"
  echo "$H" | grep -qiE 'includesubdomains|preload' && ko "HSTS avec includeSubDomains ou preload" || ok "ni includeSubDomains ni preload"
  echo "$H" | grep -qi '^x-robots-tag: noindex' && ok "X-Robots-Tag noindex : $u" || ko "noindex absent : $u"
done
echo "== invisibilité servie par Caddy"
[ "$(curl -sk "${R[@]}" https://awzid.test:18443/robots.txt)" = "$(printf 'User-agent: *\nDisallow: /')" ] && ok "robots.txt strict" || ko "robots.txt"
[ "$(cod https://awzid.test:18443/sitemap.xml)" = 404 ] && ok "sitemap.xml : 404" || ko "sitemap servi"
# documents statiques imprimables : politique de sécurité du contenu stricte posée par Caddy (ZAP 10038, 14/10/2026)
hdr https://awzid.test:18443/api/v1/health | grep -qi "^content-security-policy: default-src 'none'; frame-ancestors 'none'" && ok "api/* : CSP fermée" || ko "api/* : CSP absente"
hdr https://awzid.test:18443/api | grep -qi "^content-security-policy: default-src 'none'; frame-ancestors 'none'" && ok "/api (racine) : CSP fermée" || ko "/api (racine) : CSP absente"
hdr https://awzid.test:18443/documents/fiche-consentement-ecole.html | grep -qi "^content-security-policy: default-src 'none'.*frame-ancestors 'none'" && ok "documents/* : CSP stricte" || ko "documents/* : CSP absente"

# Cross-Origin-Resource-Policy sur les fichiers statiques (ZAP 90004, R7 du 14/10/2026)
for u in https://awzid.test:18443/robots.txt https://awzid.test:18443/favicon.svg https://awzid.test:18443/documents/fiche-consentement-ecole.html https://awzid.test:18443/api/v1/health; do
  hdr "$u" | grep -qi '^cross-origin-resource-policy: same-origin' && ok "CORP same-origin : ${u#https://awzid.test:18443}" || ko "CORP absente : ${u#https://awzid.test:18443}"
done

echo "== alias de sections : désactivés par défaut (aucune redirection, aucun certificat)"
[ "$(cod "https://quran.awzid.test:18443/")" != 301 ] && ok "quran.awzid.test non redirigé tant que l'alias est désactivé" || ko "alias actif par défaut"
echo "== activation par alias-sections.sh puis redémarrage de Caddy (sans redéploiement du code)"
AWFORM_ENV_DIR="$ALIAS_DIR" AWFORM_ALIAS_SANS_RECHARGE=1 bash "$PROD/alias-sections.sh" activer tous >/dev/null
# (le dossier des alias est monté depuis la machine : le fichier généré est visible aussitôt dans le conteneur)
docker restart "$CTN" >/dev/null 2>&1 || ko "redémarrage de Caddy"
sleep 4
for pair in arabe:/ quran:/coran fiqh:/madjaliss fikh:/madjaliss adab:/vivre akhlaq:/vivre; do
  n="${pair%%:*}"; ch="${pair#*:}"
  if [ "$(cod "https://$n.awzid.test:18443/lecons/x?y=1")" = 301 ] && [ "$(loc "https://$n.awzid.test:18443/lecons/x?y=1")" = "https://awzid.test$ch" ]; then
    ok "https://$n.awzid.test → 301 vers https://awzid.test$ch"
  else
    ko "$n : $(cod "https://$n.awzid.test:18443/") $(loc "https://$n.awzid.test:18443/")"
  fi
  hdr "https://$n.awzid.test:18443/" | grep -qi '^x-robots-tag: noindex' && ok "noindex ($n)" || ko "noindex absent ($n)"
done
[ "$(loc "http://quran.awzid.test:18080/a")" = "https://awzid.test/coran" ] && ok "http://quran → direct vers la section" || ko "http quran"
echo
[ "$BAD" = 0 ] && echo "Caddyfile : essai local OK" || echo "Caddyfile : ÉCHEC"
exit "$BAD"
