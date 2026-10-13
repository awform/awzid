#!/usr/bin/env bash
# ESSAI REJOUABLE du mode invitation et du mode fermé sur une instance en marche, par l'API seulement (jamais d'écriture
# directe dans la base) :
#   infra/prod/acces-essai.sh [http://127.0.0.1]
# DÉMONSTRATION SEULEMENT (identifiants courts de la démonstration, constante publique du dépôt) : refuse de tourner si la
# connexion simplifiée n'est pas active. Déroulement :
#   1. connexion de l'administrateur de démonstration ; 2. lecture des réglages d'accès (rétablis à la fin quoi qu'il arrive) ;
#   3. création d'une invitation d'essai (2 usages) ; 4. mode « invitation » : sans code → refusé, mauvais code → refusé,
#   bon code → inscription (2 fois), 3e fois → refusé ; 5. révocation ; 6. mode FERMÉ : un visiteur reçoit la page de
#   maintenance (503) et l'API répond « acces_ferme » ; 7. RETOUR ARRIÈRE : site rouvert, tout répond de nouveau 200 ;
#   8. les comptes d'essai sont supprimés par l'API (effacement définitif sous 30 jours) ; 9. réglages d'origine rétablis.
set -uo pipefail
BASE="${1:-http://127.0.0.1}"
H=(-H 'content-type: application/json' -H 'x-awform: 1')
DIR="$(mktemp -d)"; ADM="$DIR/admin.jar"
BAD=0
ok() { printf '  ok      %s\n' "$*"; }
ko() { printf '  ÉCHEC   %s\n' "$*"; BAD=1; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
api() { curl -s "${H[@]}" "$@"; }
PW="essai-acces-$(date +%s)-Zz9"

# 1. administrateur de démonstration
R="$(curl -s -c "$ADM" "${H[@]}" -X POST "$BASE/api/v1/auth/login" -d '{"email":"admin","password":"awzid"}')"
echo "$R" | grep -q '"account"' || { echo "connexion de l'administrateur de démonstration impossible (instance de démonstration ?) : $R" | cut -c1-200; exit 2; }
adm() { curl -s -b "$ADM" "${H[@]}" "$@"; }

# 2. réglages d'origine
ORIG="$(adm "$BASE/api/v1/admin/acces")"
ORIG_INSC="$(echo "$ORIG" | sed -n 's/.*"inscription":"\([a-z]*\)".*/\1/p' | head -1)"
ORIG_SITE="$(echo "$ORIG" | sed -n 's/.*"site":"\([a-z]*\)".*/\1/p' | head -1)"
echo "réglages d'origine : inscription=$ORIG_INSC site=$ORIG_SITE"
restaurer() {
  adm -X PUT "$BASE/api/v1/admin/acces" -d "{\"inscription\":\"$ORIG_INSC\",\"site\":\"$ORIG_SITE\"}" >/dev/null
  for c in "$DIR"/compte-*; do
    [ -e "$c" ] || continue
    curl -s -b "$c" "${H[@]}" -X POST "$BASE/api/v1/account/delete" -d "{\"password\":\"$PW\"}" >/dev/null
  done
  find "$DIR" -type f -delete
  rmdir "$DIR" 2>/dev/null || true
}
trap restaurer EXIT

inscrire() { # email [code] → code HTTP ; cookie dans le fichier $JAR.<email>
  local email="$1" inv="${2:-}" jar
  jar="$DIR/compte-$email"
  local extra=""; [ -n "$inv" ] && extra=",\"invitation\":\"$inv\""
  local c
  c="$(curl -s -o /tmp/acces-essai.out -w '%{http_code}' -c "$jar" "${H[@]}" -X POST "$BASE/api/v1/auth/signup" \
    -d "{\"kind\":\"adulte\",\"email\":\"$email\",\"password\":\"$PW\",\"country\":\"FR\",\"consents\":[\"cgu\",\"donnee_religieuse_art9\"],\"birthYear\":1990,\"pseudonym\":\"Essai\"$extra}")"
  [ "$c" = 201 ] || find "$DIR" -name "compte-$email" -delete
  echo "$c"
}
N="$(date +%s)"

# 3. invitation d'essai (2 usages)
INV="$(adm -X POST "$BASE/api/v1/admin/invitations" -d '{"libelle":"essai acces-essai.sh","max":2,"jours":1}')"
CODE="$(echo "$INV" | sed -n 's/.*"code":"\(AWZ-[A-Z0-9-]*\)".*/\1/p')"
ID="$(echo "$INV" | sed -n 's/.*"id":"\([0-9a-f-]*\)".*/\1/p')"
[ -n "$CODE" ] && ok "invitation créée (2 usages), code non affiché" || { ko "création de l'invitation : $INV"; exit 1; }

# 4. mode invitation
adm -X PUT "$BASE/api/v1/admin/acces" -d '{"inscription":"invitation"}' >/dev/null
[ "$(api "$BASE/api/v1/acces/statut" | grep -c '"inscription":"invitation"')" = 1 ] && ok "statut public : inscription sur invitation" || ko "statut public"
[ "$(inscrire "essai-a-$N@exemple.invalid")" = 403 ] && ok "sans code : refusé" || ko "sans code accepté"
[ "$(inscrire "essai-b-$N@exemple.invalid" AWZ-22222-33333)" = 403 ] && ok "mauvais code : refusé" || ko "mauvais code accepté"
[ "$(inscrire "essai-c-$N@exemple.invalid" "$CODE")" = 201 ] && ok "bon code : inscription 1/2" || ko "bon code refusé"
[ "$(inscrire "essai-d-$N@exemple.invalid" "$CODE")" = 201 ] && ok "bon code : inscription 2/2" || ko "2e usage refusé"
[ "$(inscrire "essai-e-$N@exemple.invalid" "$CODE")" = 403 ] && ok "3e usage : refusé (épuisée)" || ko "3e usage accepté"

# 5. révocation
INV2="$(adm -X POST "$BASE/api/v1/admin/invitations" -d '{"max":5,"jours":1}')"
CODE2="$(echo "$INV2" | sed -n 's/.*"code":"\(AWZ-[A-Z0-9-]*\)".*/\1/p')"
ID2="$(echo "$INV2" | sed -n 's/.*"id":"\([0-9a-f-]*\)".*/\1/p')"
adm -X POST "$BASE/api/v1/admin/invitations/$ID2/revoquer" -d '{}' >/dev/null
[ "$(inscrire "essai-f-$N@exemple.invalid" "$CODE2")" = 403 ] && ok "invitation révoquée : refusée" || ko "révoquée acceptée"
adm -X PUT "$BASE/api/v1/admin/acces" -d '{"inscription":"ouverte"}' >/dev/null
[ "$ID" != "" ] && adm -X POST "$BASE/api/v1/admin/invitations/$ID/revoquer" -d '{}' >/dev/null

# 6. mode fermé
adm -X PUT "$BASE/api/v1/admin/acces" -d '{"site":"ferme"}' >/dev/null
[ "$(code "$BASE/api/v1/levels")" = 503 ] && ok "fermé : l'API répond 503 à un visiteur" || ko "API ouverte alors que le site est fermé"
[ "$(code -H 'accept: text/html' "$BASE/")" = 503 ] && ok "fermé : la page d'accueil est la page de maintenance (503)" || ko "page d'accueil servie"
curl -s -H 'accept: text/html' "$BASE/" | grep -qi 'momentanément fermé' && ok "page de maintenance sobre" || ko "texte de maintenance absent"
[ "$(code "$BASE/healthz")" = 200 ] && ok "fermé : la sonde /healthz répond" || ko "sonde coupée"
[ "$(code -b "$ADM" "$BASE/api/v1/levels")" = 200 ] && ok "fermé : l'administrateur garde la main" || ko "administrateur bloqué"
[ "$(code "$BASE/robots.txt")" = 200 ] && ok "fermé : robots.txt toujours servi" || ko "robots.txt"

# 7. retour arrière
adm -X PUT "$BASE/api/v1/admin/acces" -d '{"site":"ouvert"}' >/dev/null
sleep 6 # cache de 5 s de l'application web
[ "$(code "$BASE/api/v1/levels")" = 200 ] && ok "retour arrière : l'API répond de nouveau 200" || ko "API toujours fermée"
[ "$(code -H 'accept: text/html' "$BASE/")" = 200 ] && ok "retour arrière : la page d'accueil répond 200" || ko "page d'accueil toujours fermée"

echo "nettoyage : suppression des comptes d'essai et rétablissement des réglages d'origine"
exit "$BAD"
