#!/usr/bin/env bash
# TEST DE BOUT EN BOUT DU RELAIS D'ÉCOLE (complément B) avec Docker Compose, sur des instances JETABLES :
#   1. serveur central monté par le vrai deploy.sh (site « central.test », HTTPS par l'autorité locale de Caddy) ;
#   2. relais enregistré (relais.js creer), installé par le vrai infra/relais/install.sh (fichiers seulement),
#      lancé avec infra/relais/compose.yml ; il joint le central en HTTPS ;
#   3. en ligne : inscription et envois relayés, contenus mis en copie ;
#   4. COUPURE du réseau (l'entrée du central est arrêtée) : leçon servie depuis la copie, envois mis en file
#      (un envoi répété par la tablette, un lot qui en chevauche un autre), puis coupure de COURANT du relais ;
#   5. RETOUR du réseau : la file part seule ; chaque événement est au central UNE fois (ni perte, ni doublon).
# Prérequis : Docker, images awform/{api,worker,web,relay}:<version> (AWFORM_VERSION, défaut « local »), ports 80,
# 443 et 3300 libres. Aucune donnée réelle ; tout est effacé à la fin.
#   infra/ci/test-relais.sh          (GARDER=1 : instances laissées en place en cas d'échec, pour le diagnostic)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROD="$ROOT/infra/prod"
WORK="$(mktemp -d)"
export HOME="$WORK/home"
mkdir -p "$HOME" "$WORK/ca"
export AWFORM_ENV_DIR="$HOME/.config/awform"
export AWFORM_VERSION="${AWFORM_VERSION:-local}"
DC=(docker compose -f "$PROD/compose.yml")
export AWFORM_RELAIS_CONF="$WORK/relais-conf" AWFORM_RELAIS_VAR="$WORK/relais-var"
RC=(docker compose -p awform-relais-test -f "$ROOT/infra/relais/compose.yml" -f "$WORK/relais-test.yml")
R=http://127.0.0.1:3300
cleanup() {
  # GARDER=1 : instances laissées en place pour le diagnostic (à arrêter à la main)
  [ "${GARDER:-0}" = 1 ] && { echo "instances gardées : $WORK"; return; }
  "${RC[@]}" down -v >/dev/null 2>&1 || true
  "${DC[@]}" down -v >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
fail() { echo "ÉCHEC : $*"; exit 1; }
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=process.argv[1].split(".").reduce((o,k)=>o?.[k],JSON.parse(s));console.log(typeof v==="object"?JSON.stringify(v):v)})' "$1"; }
psql() { "${DC[@]}" exec -T db psql -U awform -d awform -v ON_ERROR_STOP=1 -qtA "$@"; }
etat() { curl -fsS "$R/relais/etat.json" | json "$1"; }
attendre() { # attendre <secondes> <commande…> : jusqu'à ce que la commande réussisse
  local n="$1"; shift
  for _ in $(seq 1 "$n"); do "$@" >/dev/null 2>&1 && return 0; sleep 1; done
  return 1
}

# ---------------------------------------------------------------- 1. central
cp -rL "$ROOT/infra/ci/contenu-synthetique" "$WORK/contenu"
(cd "$WORK/contenu" && find . -type f ! -name MANIFEST.sha256 | sort | xargs sha256sum > MANIFEST.sha256)
AWFORM_DEPLOY_BUILD=0 AWFORM_DEPLOY_SYSTEME=0 AWFORM_CONTENT_DIR="$WORK/contenu" AWFORM_LEVELS=en1,ad1 \
  "$PROD/deploy.sh" --site central.test > "$WORK/deploy.log" 2>&1 || { tail -30 "$WORK/deploy.log"; fail "déploiement du central"; }
# autorité locale de Caddy : le relais lui fait confiance (en production : certificat public du domaine)
attendre 30 "${DC[@]}" cp caddy:/data/caddy/pki/authorities/local/root.crt "$WORK/ca/root.crt" || fail "autorité locale"
# certificat PUBLIC de l'autorité : lisible par le compte « node » du conteneur du relais
chmod 755 "$WORK/ca" && chmod 644 "$WORK/ca/root.crt"

# ---------------------------------------------------------------- 2. relais
JETON="$("${DC[@]}" --profile outils run --rm -T relais creer "École de test" ecole-test.relais.test 2>/dev/null | tail -1 | json jeton)"
[[ "$JETON" == rel_* ]] || fail "enregistrement du relais"
AWFORM_RELAIS_SANS_SYSTEME=1 AWFORM_RELAIS_JETON="$JETON" \
  "$ROOT/infra/relais/install.sh" --hote ecole-test.relais.test --amont https://central.test >/dev/null
cat > "$WORK/relais-test.yml" <<EOF
services:
  relay:
    extra_hosts: ['central.test:host-gateway']
    environment: { NODE_EXTRA_CA_CERTS: /ca/root.crt }
    volumes: ['$WORK/ca:/ca:ro']
    ports: ['127.0.0.1:3300:3000']
EOF
"${RC[@]}" up -d relay >/dev/null 2>&1
attendre 60 sh -c "curl -fsS $R/relais/etat.json | grep -q '\"enLigne\":true'" || fail "le relais ne joint pas le central"

# ---------------------------------------------------------------- 3. en ligne
PW="relais $(openssl rand -hex 8) phrase"
H=(-H 'content-type: application/json' -H 'x-awform: 1')
SU="$(curl -fsS -D "$WORK/su.h" "${H[@]}" "$R/api/v1/auth/signup" -d "{\"kind\":\"adulte\",\"email\":\"relais-$(openssl rand -hex 4)@relais.test\",\"password\":\"$PW\",\"country\":\"SN\",\"locale\":\"fr\",\"birthYear\":1990,\"pseudonym\":\"Élève du relais\",\"consents\":[\"cgu\",\"transfert_hors_pays\"]}")" \
  || fail "inscription par le relais"
COOKIE="$(grep -i '^set-cookie:' "$WORK/su.h" | head -1 | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]*).*/\1/')"
[ -n "$COOKIE" ] || fail "cookie de session ($SU)"
PID="$(curl -fsS -H "cookie: $COOKIE" "$R/api/v1/auth/me" | json profiles.0.id)"
curl -fsS "$R/api/v1/units/en1.l01" -o /dev/null || fail "leçon (en ligne)"
evs() { # evs <n> : n événements « checklist » d'identifiants neufs (liste JSON sans crochets)
  local ev="" i
  for i in $(seq 1 "$1"); do
    ev="$ev${ev:+,}{\"id\":\"$(cat /proc/sys/kernel/random/uuid)\",\"profileId\":\"$PID\",\"unitId\":\"en1.l01\",\"eventType\":\"checklist\",\"response\":{\"checked\":$i,\"total\":5},\"deviceAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  done
  echo "$ev"
}
lot() { echo "{\"events\":[$(evs "$1")]}"; }
envoi() { curl -sS -o "$WORK/r.json" -w '%{http_code}' -H "cookie: $COOKIE" "${H[@]}" "$R/api/v1/attempts" -d "$1"; }
[ "$(envoi "$(lot 2)")" = 200 ] || fail "envoi en ligne : $(cat "$WORK/r.json")"

# ---------------------------------------------------------------- 4. coupure du réseau, puis du courant
"${DC[@]}" stop caddy >/dev/null 2>&1
curl -fsS "$R/api/v1/units/en1.l01" -o /dev/null || fail "leçon servie depuis la copie du relais"
E1="$(evs 3)"
[ "$(envoi "{\"events\":[$E1]}")" = 202 ] || fail "envoi hors ligne non mis en file : $(cat "$WORK/r.json")"
# la tablette n'a pas reçu d'accusé : elle renvoie le même lot (fusionné par le relais : même empreinte)
[ "$(envoi "{\"events\":[$E1]}")" = 202 ] || fail "second envoi hors ligne"
[ "$(envoi "$(lot 2)")" = 202 ] || fail "troisième envoi hors ligne"
# puis un lot qui CHEVAUCHE le premier (ses 3 événements + 1 nouveau) : le central devra ignorer les doublons
[ "$(envoi "{\"events\":[$E1,$(evs 1)]}")" = 202 ] || fail "quatrième envoi hors ligne"
[ "$(etat enLigne)" = false ] || fail "le relais se croit en ligne"
[ "$(etat enAttente)" = 3 ] || fail "file du relais : $(etat enAttente) au lieu de 3"
"${RC[@]}" restart relay >/dev/null 2>&1
attendre 30 curl -fsS "$R/relais/etat.json" || fail "redémarrage du relais"
[ "$(etat enAttente)" = 3 ] || fail "file perdue au redémarrage du relais"

# ---------------------------------------------------------------- 5. retour du réseau
"${DC[@]}" start caddy >/dev/null 2>&1
attendre 120 sh -c "curl -fsS $R/relais/etat.json | grep -q '\"enAttente\":0'" || fail "la file ne part pas ($(etat enAttente) restants)"
[ "$(etat refuses)" = 0 ] || fail "envois refusés par le central"
N="$(psql -c "select count(*) || ' ' || count(distinct id) from attempt where profile_id = '$PID'")"
[ "$N" = "8 8" ] || fail "au central : $N (attendu « 8 8 » : 2 en ligne + 3 + 2 + 1 hors ligne, sans doublon)"
[ "$(envoi "$(lot 1)")" = 200 ] || fail "envoi après le retour du réseau"
echo "relais testé : ok — coupure, file chiffrée gardée au redémarrage, 8 événements au central (lot répété fusionné, lot chevauchant dédoublonné), aucun doublon"
