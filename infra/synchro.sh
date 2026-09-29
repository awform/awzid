#!/usr/bin/env bash
# AWFORM — synchronisation SÛRE du code entre les machines (PC, VM, sessions cloud) — lot 17.
# Git est la SEULE source : plus aucune copie de fichiers (scp, robocopy) pour le code. Ce script :
#   1. refuse de travailler si des modifications ne sont pas enregistrées (commit) : rien n'est jamais écrasé ;
#   2. récupère la branche distante ;
#   3. si les deux côtés ont avancé (divergence) : REFUSE et explique (fusion à faire par une personne) ;
#   4. si seul le distant a avancé : avance en « fast-forward » (aucune modification locale n'existe) ;
#   5. si seul le local a avancé : l'envoie avec --envoyer (jamais de --force).
# Usage :  infra/synchro.sh [--envoyer] [--branche <nom>] [--distant <nom>]
# Codes de sortie : 0 à jour ; 3 modifications non enregistrées ; 4 divergence ; 5 envoi refusé ; 2 usage.
set -euo pipefail
ENVOYER=0
BRANCHE=""
DISTANT="origin"
while [ $# -gt 0 ]; do
  case "$1" in
    --envoyer) ENVOYER=1 ;;
    --branche) BRANCHE="${2:-}"; shift ;;
    --distant) DISTANT="${2:-}"; shift ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
  shift
done

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "pas dans un dépôt git" >&2; exit 2; }
[ -n "$BRANCHE" ] || BRANCHE="$(git symbolic-ref --short HEAD)"
[ "$(git symbolic-ref --short HEAD)" = "$BRANCHE" ] || {
  echo "la branche courante n'est pas $BRANCHE : changer de branche d'abord (git switch $BRANCHE)" >&2
  exit 2
}

# 1. rien de non enregistré (fichiers suivis modifiés, indexés ou nouveaux fichiers non ignorés)
if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
  echo "REFUS : modifications non enregistrées ; elles ne seront pas écrasées :" >&2
  git status --short >&2
  echo "Enregistrer d'abord (git add … && git commit), puis relancer." >&2
  exit 3
fi

# 2. état du distant
git fetch --quiet "$DISTANT" "$BRANCHE" 2>/dev/null || {
  echo "branche $BRANCHE absente de $DISTANT : premier envoi avec --envoyer" >&2
  if [ "$ENVOYER" = 1 ]; then git push -u "$DISTANT" "$BRANCHE" || exit 5; exit 0; fi
  exit 0
}
REF="$DISTANT/$BRANCHE"
AVANCE="$(git rev-list --count "$REF..HEAD")"
RETARD="$(git rev-list --count "HEAD..$REF")"

# 3. divergence : les deux côtés ont des commits que l'autre n'a pas
if [ "$AVANCE" -gt 0 ] && [ "$RETARD" -gt 0 ]; then
  echo "REFUS : $BRANCHE a divergé ($AVANCE commit(s) seulement ici, $RETARD seulement sur $DISTANT)." >&2
  echo "Rien n'est écrasé. Fusionner à la main (git merge $REF), vérifier, puis relancer." >&2
  exit 4
fi

# 4. le distant est plus récent : avance sans risque (aucune modification locale)
if [ "$RETARD" -gt 0 ]; then
  git merge --ff-only --quiet "$REF"
  echo "mis à jour : $RETARD commit(s) récupéré(s) de $REF"
fi

# 5. le local est plus récent
if [ "$AVANCE" -gt 0 ]; then
  if [ "$ENVOYER" = 1 ]; then
    git push "$DISTANT" "$BRANCHE" || { echo "REFUS de $DISTANT (quelqu'un a envoyé entre-temps) : relancer" >&2; exit 5; }
    echo "envoyé : $AVANCE commit(s) vers $REF"
  else
    echo "$AVANCE commit(s) local(aux) non envoyé(s) : relancer avec --envoyer"
  fi
fi
[ "$AVANCE" -gt 0 ] || [ "$RETARD" -gt 0 ] || echo "déjà à jour ($BRANCHE)"
exit 0
