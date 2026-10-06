#!/usr/bin/env bash
# A2 — identifiants de Quran Foundation pour l'API (récitateurs en ligne) :
#   infra/prod/qf-env.sh <qf.env> <api.env>        (appelé par deploy.sh après env-split.sh)
# <qf.env> = fichier de secrets de déploiement de QF, le MÊME que la synchronisation du Muṣḥaf exact (A34) :
# ~/.config/awform/qf.env (autre chemin : AWFORM_QF_SECRET), droits 600, hors dépôt, trois lignes exactes :
#   QF_CLIENT_ID=…
#   QF_CLIENT_SECRET=…
#   QF_ENV=production      (ou prelive)
# Le fichier est LU (jamais exécuté) ; toute autre clé le fait ignorer. Les valeurs sont AJOUTÉES à api.env
# (droits 600, écriture atomique) seulement si api.env ne les a pas déjà (prod.env garde la priorité).
# Absent ou refusé : rien n'est ajouté, l'audio en ligne reste inactif, sans faire échouer le déploiement.
# Le secret n'est jamais affiché.
set -euo pipefail
SRC="$1"
DEST="$2"
if [ ! -f "$SRC" ]; then
  echo "QF : $SRC absent — récitateurs en ligne inactifs"
  exit 0
fi
if [ "$(stat -c %a "$SRC")" != 600 ]; then
  echo "QF : $SRC ignoré (droits $(stat -c %a "$SRC"), 600 exigés) — récitateurs en ligne inactifs" >&2
  exit 0
fi
declare -A val=()
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in '' | \#*) continue ;; esac
  k="${line%%=*}"
  v="${line#*=}"
  case "$k" in
    QF_CLIENT_ID | QF_CLIENT_SECRET | QF_ENV) val[$k]="$v" ;;
    *)
      echo "QF : $SRC ignoré (clé inattendue) — récitateurs en ligne inactifs" >&2
      exit 0
      ;;
  esac
done <"$SRC"
if [ -z "${val[QF_CLIENT_ID]:-}" ] || [ -z "${val[QF_CLIENT_SECRET]:-}" ]; then
  echo "QF : $SRC incomplet (QF_CLIENT_ID et QF_CLIENT_SECRET exigés) — récitateurs en ligne inactifs" >&2
  exit 0
fi
umask 077
touch "$DEST"
tmp="$(mktemp "$(dirname "$DEST")/.api.env.XXXXXX")"
cat "$DEST" >"$tmp"
for k in QF_ENV QF_CLIENT_ID QF_CLIENT_SECRET; do
  [ -n "${val[$k]:-}" ] || continue
  grep -q "^$k=" "$tmp" || printf '%s=%s\n' "$k" "${val[$k]}" >>"$tmp"
done
chmod 600 "$tmp"
mv -f "$tmp" "$DEST"
echo "QF : identifiants donnés à l'API (${val[QF_ENV]:-prelive}) — récitateurs en ligne actifs"
