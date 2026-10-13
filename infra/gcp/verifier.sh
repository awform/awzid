#!/usr/bin/env bash
# Vérification sur le serveur de bêta, depuis le serveur lui-même (aucune ouverture) :
#   bash ~/awform-app/infra/gcp/verifier.sh
# santé de l'API, page d'accueil 200, migrations appliquées, édition publiée, conteneurs, mémoire, sauvegardes.
set -uo pipefail
cd ~/awform-app
export AWFORM_ENV_DIR=~/.config/awform
DC=(docker compose -f infra/prod/compose.yml)
echo "== santé : $(curl -fsS http://127.0.0.1/api/v1/health)"
echo "== accueil : HTTP $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)"
echo "== domaine (HTTP -> HTTPS) : $(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H 'Host: app.awzid.com' http://127.0.0.1/)"
q() { "${DC[@]}" exec -T db psql -U awform -d awform -qtA -c "$1"; }
for t in $(q "select table_schema||'.'||table_name from information_schema.tables where table_name ilike '%migration%'"); do
  echo "== migrations ($t) : $(q "select count(*) from $t") appliquées ; dernière : $(q "select to_timestamp(max(created_at)/1000) from $t" 2>/dev/null)"
done
echo "== éditions publiées : $(q "select string_agg(code, ', ') from edition" 2>/dev/null)"
echo "== niveaux servis : $(curl -fsS http://127.0.0.1/api/v1/levels | grep -o '"code":"[a-z0-9]*"' | wc -l)"
echo "== comptes : $(q 'select count(*) from account')"
"${DC[@]}" ps --format 'table {{.Name}}\t{{.Status}}'
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}'
free -h | head -2; df -h / | tail -1
echo "== minuteries"; systemctl list-timers --no-pager | grep -E 'awform|awzid'
echo "== sauvegardes"; tail -4 ~/awform-backups/backup.log 2>/dev/null
grep -c . ~/.config/awform/prod.env | sed 's/^/prod.env : lignes /'; stat -c 'prod.env droits %a' ~/.config/awform/prod.env
grep -E '^(AWFORM_DEMO|AWFORM_HTTP|COOKIE_SECURE|SITE|AWFORM_ECOUTE)=' ~/.config/awform/prod.env | sed 's/=.*demo.*/=<démo>/'
