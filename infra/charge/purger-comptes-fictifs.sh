#!/usr/bin/env bash
# Purge des comptes FICTIFS de la DÉMO créés par les tests de charge du 14/10/2026 :
#   charge-0 … charge-49 @demo.awform.test  (infra/charge/semis-comptes.mjs)  et  limite-0 … limite-19 @demo.awform.test.
# DÉMO SEULEMENT : refuse de tourner si le conteneur de l'API n'a pas AWFORM_DEMO=1 (jamais sur le serveur de bêta).
#   infra/charge/purger-comptes-fictifs.sh          → essai à blanc : liste et compte ce qui serait supprimé, ne change RIEN
#   infra/charge/purger-comptes-fictifs.sh --oui    → sauvegarde de la base (pg_dump) puis suppression en UNE transaction
# Les adresses sont comparées une à une par une expression exacte (pas de joker : les comptes de semis et les comptes des
# tests e2e ne correspondent pas). Les profils, sessions, appartenances à la bêta, consentements, etc. partent en cascade
# (clés « ON DELETE CASCADE » du schéma) ; les lignes du journal d'audit qui visaient ces comptes sont pseudonymisées comme
# pour un effacement RGPD (purge.ts). Une ligne `demo.purge_comptes_fictifs` est ajoutée au journal d'audit, et la procédure
# écrit son propre journal (AWFORM_PURGE_LOG, défaut ~/purge-comptes-fictifs.log). Aucun mot de passe ni secret n'est lu.
set -euo pipefail
OUI=0
[ "${1:-}" = "--oui" ] && OUI=1
DBC="${AWFORM_DB_CTN:-awform-db-1}"
API="${AWFORM_API_CTN:-awform-api-1}"
LOG="${AWFORM_PURGE_LOG:-$HOME/purge-comptes-fictifs.log}"
SAUV="${AWFORM_PURGE_SAUV:-$HOME/sauvegardes-purge}"
PAT='^(charge-([0-9]|[1-4][0-9])|limite-([0-9]|1[0-9]))@demo[.]awform[.]test$'
q() { docker exec -i "$DBC" psql -U awform -d awform -v ON_ERROR_STOP=1 -tA "$@"; }
note() { printf '%s  %s\n' "$(date -Is)" "$*" | tee -a "$LOG"; }

[ "$(docker exec "$API" printenv AWFORM_DEMO 2>/dev/null || true)" = 1 ] || { echo "REFUS : ce n'est pas la démo (AWFORM_DEMO≠1)"; exit 2; }

CIBLES="select id from account where email ~ '$PAT'"
N="$(q -c "select count(*) from ($CIBLES) s")"
AUTRES="$(q -c "select count(*) from account where (email is null or email !~ '$PAT')")"
echo "comptes visés : $N (attendu au plus 70) ; autres comptes (jamais touchés) : $AUTRES"
[ "$N" -le 70 ] || { echo "REFUS : plus de 70 correspondances"; exit 3; }
echo "droits particuliers parmi les visés (doit être vide hors « eleve_adulte ») :"
q -c "select r.role, count(*) from account_role r where r.account_id in ($CIBLES) group by 1"
BAD="$(q -c "select count(*) from account_role r where r.account_id in ($CIBLES) and r.role not in ('eleve_adulte','beta_fermee')")"
[ "$BAD" = 0 ] || { echo "REFUS : un compte visé a un rôle particulier (enseignant, administrateur…)"; exit 3; }
SW="$(q -c "select (select count(*) from class_teacher where account_id in ($CIBLES)) + (select count(*) from school_member where account_id in ($CIBLES))")"
[ "$SW" = 0 ] || { echo "REFUS : un compte visé est enseignant ou membre d'école"; exit 3; }
echo "données liées (supprimées en cascade) :"
q -c "select 'profils', count(*) from profile where owner_account_id in ($CIBLES) union all select 'sessions', count(*) from session where account_id in ($CIBLES) union all select 'membres bêta', count(*) from beta_member where account_id in ($CIBLES) union all select 'lignes d''audit pseudonymisées', count(*) from audit_log where actor_account_id in ($CIBLES)"
if [ "$OUI" != 1 ]; then echo "ESSAI À BLANC : rien n'a été modifié (relancer avec --oui)."; exit 0; fi

mkdir -p "$SAUV"; chmod 700 "$SAUV"
F="$SAUV/avant-purge-$(date +%Y%m%d-%H%M%S).dump"
docker exec "$DBC" pg_dump -U awform -d awform -Fc > "$F"
chmod 600 "$F"
note "sauvegarde avant purge : $F ($(stat -c %s "$F") octets) ; $N comptes visés, $AUTRES autres comptes"
RES="$(q <<SQL
begin;
create temp table cibles on commit drop as select id from account where email ~ '$PAT';
create temp table cprof on commit drop as select id from profile where owner_account_id in (select id from cibles);
update audit_log set target = null, before = null, after = null
  where target in (select id from cibles union select id from cprof);
with d as (delete from account where id in (select id from cibles) returning id)
  insert into audit_log (action, after) select 'demo.purge_comptes_fictifs', jsonb_build_object('nombre', count(*), 'motif', 'comptes de charge de la demo (14/10/2026)') from d;
select count(*) from account where email ~ '$PAT';
commit;
SQL
)"
RESTE="$(echo "$RES" | tail -1)"
APRES="$(q -c "select count(*) from account where (email is null or email !~ '$PAT')")"
note "purge faite : visés restants = $RESTE ; autres comptes avant/après = $AUTRES/$APRES"
[ "$RESTE" = 0 ] && [ "$APRES" = "$AUTRES" ] || { note "ÉCART : à examiner (sauvegarde : $F)"; exit 4; }
echo "restauration possible depuis $F (pg_restore) si nécessaire."
