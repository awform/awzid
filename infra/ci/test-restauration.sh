#!/usr/bin/env bash
# TEST AUTOMATISÉ DE RESTAURATION (complément A) sur une instance Docker Compose JETABLE (HOME temporaire) :
#   1. instance montée par le vrai deploy.sh --demo (contenu synthétique, données de démonstration) ;
#   2. nombre de lignes de CHAQUE table de données (schémas public et drizzle ; la file de travaux pgboss,
#      qui change dès que le travailleur redémarre, n'est pas comparée) ;
#   3. sauvegarde chiffrée par le vrai backup.sh ;
#   4. base vidée (supprimée), vérifiée vide ;
#   5. restauration complète par restore.sh (clé privée par l'entrée standard) ;
#   6. mêmes nombres de lignes, table par table ; santé de l'API ; application servie.
# Prérequis : Docker, images awform/{api,worker,web}:<version> déjà construites (AWFORM_DEPLOY_BUILD=0),
# ports 80 et 443 libres. Aucune donnée réelle, aucun secret conservé : tout est effacé à la fin.
#   infra/ci/test-restauration.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROD="$ROOT/infra/prod"
WORK="$(mktemp -d)"
export HOME="$WORK/home"
mkdir -p "$HOME"
export AWFORM_ENV_DIR="$HOME/.config/awform"
# images de la CI (docker compose build) : awform/*:local, sauf version donnée
export AWFORM_VERSION="${AWFORM_VERSION:-local}"
DC=(docker compose -f "$PROD/compose.yml")
cleanup() {
  "${DC[@]}" down -v >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
fail() { echo "ÉCHEC : $*"; exit 1; }

# contenu synthétique : copie sans lien symbolique (monté dans le conteneur d'import) + empreintes
cp -rL "$ROOT/infra/ci/contenu-synthetique" "$WORK/contenu"
(cd "$WORK/contenu" && find . -type f ! -name MANIFEST.sha256 | sort | xargs sha256sum > MANIFEST.sha256)

AWFORM_DEPLOY_BUILD=0 AWFORM_DEPLOY_SYSTEME=0 AWFORM_CONTENT_DIR="$WORK/contenu" AWFORM_LEVELS=en1,ad1 \
  "$PROD/deploy.sh" --demo --site 192.0.2.10 > "$WORK/deploy.log" 2>&1 || { tail -30 "$WORK/deploy.log"; fail "déploiement"; }

psql() { "${DC[@]}" exec -T db psql -U awform -v ON_ERROR_STOP=1 -qtA "$@"; }
# « schéma.table nombre » pour chaque table (triées) ; le travailleur est arrêté pendant les comptes
counts() {
  psql -d awform -c "select format('select %L || '' '' || count(*) from %I.%I', n.nspname || '.' || c.relname, n.nspname, c.relname)
                     from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where c.relkind in ('r', 'p') and n.nspname in ('public', 'drizzle')
                     order by 1" \
    | while read -r q; do psql -d awform -c "$q" < /dev/null; done
}
"${DC[@]}" stop api worker web >/dev/null
counts > "$WORK/avant.txt"
TABLES="$(wc -l < "$WORK/avant.txt")"
ROWS="$(awk '{s += $2} END {print s}' "$WORK/avant.txt")"
[ "$TABLES" -ge 60 ] || fail "trop peu de tables ($TABLES)"
awk '$1 == "public.account" && $2 >= 3 {ok = 1} END {exit !ok}' "$WORK/avant.txt" || fail "données de démonstration absentes"

FILE="$("$PROD/backup.sh" | tail -1)"
[ -s "$FILE" ] || fail "sauvegarde"

psql -d postgres -c "DROP DATABASE awform WITH (FORCE)"
psql -d postgres -c "CREATE DATABASE awform OWNER awform"
[ "$(psql -d awform -c "select count(*) from pg_tables where schemaname = 'public'")" = 0 ] || fail "base non vidée"

"$PROD/restore.sh" --je-remplace-la-base "$FILE" < "$HOME/.config/awform/A-EMPORTER-backup-private.asc"

"${DC[@]}" stop api worker web >/dev/null
counts > "$WORK/apres.txt"
diff -u "$WORK/avant.txt" "$WORK/apres.txt" || fail "nombres de lignes différents après restauration"
"${DC[@]}" up -d api worker web >/dev/null
for i in $(seq 1 60); do
  curl -fsS http://127.0.0.1/api/v1/health 2>/dev/null | grep -q '"status":"ok"' && break
  [ "$i" = 60 ] && fail "santé après restauration"
  sleep 2
done
"$PROD/smoke.sh" http://127.0.0.1 >/dev/null || fail "fumée après restauration"
echo "restauration testée : ok — $TABLES tables, $ROWS lignes identiques avant et après"
