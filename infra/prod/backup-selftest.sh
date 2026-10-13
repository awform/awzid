#!/usr/bin/env bash
# TEST DE RESTAURATION RÉEL ET REJOUABLE, autonome (aucune clé du client n'est utilisée, aucune écriture dans la base) :
#   infra/prod/backup-selftest.sh
# Il rejoue de bout en bout la chaîne des sauvegardes, avec des données réelles de la base en service :
#   1. une paire de clés JETABLE est créée par le vrai backup-keygen.sh, dans la mémoire (/dev/shm) ;
#   2. le VRAI backup.sh sauvegarde la base en service (pg_dump en LECTURE, chiffrement à clé publique, empreinte,
#      rotation, journal) dans un dossier jetable ;
#   3. l'empreinte est vérifiée, la sauvegarde est déchiffrée EN FLUX (le texte clair n'est jamais écrit sur le disque)
#      et restaurée dans un PostgreSQL JETABLE (conteneur sans réseau, volume supprimé à la fin) ;
#   4. les tables principales sont comparées à la base en service (la restauration ne peut jamais avoir PLUS de lignes) ;
#      les 6 236 versets du Coran et au moins une édition sont exigés ;
#   5. tout est effacé : clés, sauvegarde, conteneur, volume. Code de sortie 0 si tout est bon.
# Ce test prouve que la chaîne (script, chiffrement, déchiffrement, restauration) fonctionne. Il ne prouve PAS que la clé
# privée du client est bien gardée : pour cela, `infra/pc/test-restauration.ps1` (clé réelle, une fois par mois).
# Source : la base du service « db » du projet Compose « awform » (démonstration ou production), jamais modifiée.
# Durée : de l'ordre de 15 à 30 minutes pour une base de plusieurs Go.
set -euo pipefail
PROD="$(cd "$(dirname "$0")" && pwd)"
CONF="${AWFORM_ENV_DIR:-$HOME/.config/awform}"
IMG="${AWFORM_SELFTEST_IMAGE:-postgres:18}"
SHM=/dev/shm
[ -d "$SHM" ] && [ -w "$SHM" ] || SHM="${TMPDIR:-/tmp}"
umask 077
# NOMS COURTS : GnuPG déchiffre mal (« Bad secret key ») quand le chemin de son trousseau fait de 25 à 40 caractères
# environ (constaté le 13/10/2026 sur GnuPG 2.4.8 : /dev/shm/awform-gpg1.XXXXXX échoue, /dev/shm/h.XXXXXX réussit)
KEYHOME="$(mktemp -d "$SHM/ak.XXXXXX")"
WORK="$(mktemp -d "${AWFORM_SELFTEST_DIR:-${TMPDIR:-/var/tmp}}/awform-selftest.XXXXXX")"
CTN="awform-selftest-db-$$"
t0=$(date +%s)
cleanup() {
  docker rm -f -v "$CTN" >/dev/null 2>&1 || true
  # effacement des clés jetables puis des fichiers
  find "$KEYHOME" "$SHM"/ah[0-9]*.?????? -type f -exec shred -u {} + 2>/dev/null || true
  rm -rf "$KEYHOME" "$SHM"/ah[0-9]*.?????? "$WORK"
}
trap cleanup EXIT
say() { printf '%s\n' "$*"; }
fail() { say "ÉCHEC : $*"; exit 1; }

SRC="$(docker ps -q --filter label=com.docker.compose.project=awform --filter label=com.docker.compose.service=db | head -1)"
[ -n "$SRC" ] || fail "aucune base en service (conteneur « db » du projet awform)"
srcsql() { docker exec -i "$SRC" psql -U awform -d awform -v ON_ERROR_STOP=1 -qtA "$@"; }
rstsql() { docker exec -i "$CTN" psql -U postgres -d awform -v ON_ERROR_STOP=1 -qtA "$@"; }

say "1/5 clés jetables (mémoire)"
HOME="$KEYHOME" bash "$PROD/backup-keygen.sh" >/dev/null 2>&1
PUB="$KEYHOME/.config/awform/backup-public.asc"
PRIV="$KEYHOME/.config/awform/A-EMPORTER-backup-private.asc"
[ -s "$PUB" ] && [ -s "$PRIV" ] || fail "paire de clés jetable non créée"

say "2/5 sauvegarde réelle (backup.sh, lecture de la base en service)"
FILE="$(AWFORM_BACKUP_PUB="$PUB" AWFORM_BACKUP_DIR="$WORK/sauvegardes" AWFORM_ENV_DIR="$CONF" bash "$PROD/backup.sh" | tail -1)"
[ -s "$FILE" ] || fail "sauvegarde absente"
grep -q ' ok awform-' "$WORK/sauvegardes/backup.log" || fail "journal sans « ok »"
SIZE="$(stat -c %s "$FILE")"
say "    $(basename "$FILE") : $SIZE octets"
sha256sum -c "$FILE.sha256" >/dev/null || fail "empreinte de la sauvegarde"
# le fichier est bien chiffré (pas de texte clair PostgreSQL au début)
if head -c 5 "$FILE" | grep -q PGDMP; then fail "la sauvegarde n'est pas chiffrée"; fi

say "3/5 PostgreSQL jetable"
docker run -d --name "$CTN" --network none -e POSTGRES_PASSWORD=selftest -e POSTGRES_DB=awform "$IMG" >/dev/null
for i in $(seq 1 60); do
  docker exec "$CTN" pg_isready -U postgres -d awform >/dev/null 2>&1 && break
  [ "$i" = 60 ] && fail "le PostgreSQL jetable ne démarre pas"
  sleep 2
done
sleep 2
# les sauvegardes contiennent les droits (GRANT) des comptes de l'API et du travailleur : sur un serveur NEUF, ces rôles
# (créés par `deploy.sh`, service « roles ») doivent exister avant la restauration
for role in awform awform_api awform_worker; do
  docker exec "$CTN" psql -U postgres -qtA -c "CREATE ROLE $role NOLOGIN" >/dev/null
done

say "4/5 déchiffrement en flux et restauration"
# GnuPG répond parfois « Bad secret key » juste après l'importation de la clé (agent lancé pendant l'import) alors que la
# clé est bonne : on prépare le trousseau en vérifiant qu'il déchiffre le DÉBUT de la sauvegarde, avec un trousseau NEUF
# à chaque essai (jusqu'à 6), puis on restaure en flux avec le trousseau qui a réussi.
OKGH=""
for essai in 1 2 3 4 5 6; do
  GH2="$(mktemp -d "$SHM/ah$essai.XXXXXX")"
  gpg --homedir "$GH2" --batch --quiet --import "$PRIV" 2>/dev/null
  # (le groupe { … || true; } évite qu'un SIGPIPE de gpg, fermé par head, fasse échouer le tube sous pipefail)
  entete="$( { gpg --homedir "$GH2" --batch --quiet --pinentry-mode loopback --passphrase '' --decrypt "$FILE" 2>"$WORK/gpg.err" || true; } | head -c 5)"
  if [ "$entete" = PGDMP ]; then
    OKGH="$GH2"
    break
  fi
  gpgconf --homedir "$GH2" --kill gpg-agent 2>/dev/null || true
  say "    déchiffrement refusé (essai $essai) : $(head -c 120 "$WORK/gpg.err" | tr '\n' ' ') — nouveau trousseau"
  sleep 1
done
[ -n "$OKGH" ] || fail "déchiffrement de la sauvegarde avec la clé jetable"
gpg --homedir "$OKGH" --batch --quiet --pinentry-mode loopback --passphrase '' --decrypt "$FILE" \
  | docker exec -i "$CTN" pg_restore -U postgres -d awform --no-owner --exit-on-error \
  || fail "restauration (pg_restore)"

say "5/5 comparaison avec la base en service"
STATUS=0
printf '%-18s %12s %12s   %s\n' table "en service" restauree verdict
for tbl in account profile consent attempt hifz_event practice_event quran_verse unit_version edition invitation waitlist; do
  live="$(srcsql -c "select count(*) from $tbl" 2>/dev/null || echo absente)"
  rest="$(rstsql -c "select count(*) from $tbl" 2>/dev/null || echo absente)"
  flag=ok
  if [ "$live" = absente ]; then
    flag="(absente de la base en service)"
  elif [ "$rest" = absente ] || [ "$rest" -gt "$live" ]; then
    flag="ÉCHEC"; STATUS=1
  fi
  # une base en service qui contient des lignes doit en avoir dans la restauration
  case "$live$rest" in *absente*) ;; *) [ "$live" -eq 0 ] || [ "$rest" -gt 0 ] || { flag="ÉCHEC"; STATUS=1; } ;; esac
  case "$tbl" in
    quran_verse) [ "$rest" = 6236 ] || { flag="ÉCHEC (6 236 versets attendus)"; STATUS=1; } ;;
    edition | unit_version) [ "$rest" != absente ] && [ "$rest" -ge 1 ] || { flag="ÉCHEC (au moins 1 attendu)"; STATUS=1; } ;;
  esac
  printf '%-18s %12s %12s   %s\n' "$tbl" "$live" "$rest" "$flag"
done
# structure : même nombre de tables publiques
nl="$(srcsql -c "select count(*) from information_schema.tables where table_schema='public'")"
nr="$(rstsql -c "select count(*) from information_schema.tables where table_schema='public'")"
[ "$nl" = "$nr" ] || { say "ÉCHEC : $nl tables en service, $nr restaurées"; STATUS=1; }
say "durée : $(( $(date +%s) - t0 )) s, tables : $nr"
if [ "$STATUS" = 0 ]; then say "restauration jetable : OK"; else say "restauration jetable : ÉCHEC"; fi
exit "$STATUS"
