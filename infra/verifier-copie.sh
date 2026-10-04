#!/usr/bin/env bash
# AWFORM — avant de REMPLACER une copie du contenu des livres (~/awform-content, écrite par sync-content.ps1) :
# vérifie qu'elle n'a pas été modifiée depuis la dernière copie (MANIFEST.sha256). Lot 17 : on ne remplace
# jamais une copie qui porte des modifications plus récentes que la source (elles seraient perdues).
#   infra/verifier-copie.sh <dossier>
# 0 : copie intacte (ou absente) — remplaçable ; 3 : fichiers modifiés, ajoutés ou supprimés (liste sur stderr).
set -euo pipefail
# lot 28 : tri et comparaison dans le même ordre quelle que soit la langue de la session ssh
export LC_ALL=C
DIR="${1:?dossier}"
[ -d "$DIR" ] || exit 0
cd "$DIR"
if [ ! -f MANIFEST.sha256 ]; then
  echo "REFUS : $DIR n'a pas de MANIFEST.sha256 (copie inconnue) ; la déplacer à la main avant de recopier." >&2
  exit 3
fi
bad=0
if ! out="$(sha256sum --quiet -c MANIFEST.sha256 2>&1)"; then
  echo "$out" >&2
  bad=1
fi
# fichiers ajoutés depuis la copie
extra="$(comm -13 <(sed 's/^[0-9a-f]*  //' MANIFEST.sha256 | sort) \
  <(find . -type f ! -name MANIFEST.sha256 ! -name COPIE.txt | sort))"
if [ -n "$extra" ]; then
  echo "ajoutés depuis la copie :" >&2
  echo "$extra" >&2
  bad=1
fi
if [ "$bad" = 1 ]; then
  echo "REFUS : la copie $DIR a été modifiée depuis le $(cat COPIE.txt 2>/dev/null || echo '?') ; rien n'est remplacé." >&2
  echo "Reporter ces modifications dans la source (dossier W du PC), ou relancer avec -Force pour les abandonner." >&2
  exit 3
fi
exit 0
