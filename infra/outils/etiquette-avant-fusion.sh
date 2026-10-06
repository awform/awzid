#!/usr/bin/env bash
# Lot F5 — ÉTIQUETTE `avant-<lot>` posée sur `main` JUSTE AVANT chaque fusion (procédure : EXPLOITATION § 11).
# Elle marque l'état connu et sain d'avant la fusion : retour arrière du code (git revert de la fusion) ou
# redéploiement de cet état en quelques minutes, sans chercher le bon commit.
#
#   infra/outils/etiquette-avant-fusion.sh <lot> [dépôt]   ex. : etiquette-avant-fusion.sh f5 ~/awform-app
#
# Refuse : nom de lot invalide, étiquette déjà posée, `main` absente. Pousse l'étiquette vers `origin` s'il existe.
set -euo pipefail

LOT="${1:-}"
DEPOT="${2:-.}"
if ! [[ "$LOT" =~ ^[a-z0-9][a-z0-9-]{0,40}$ ]]; then
  echo "usage : $0 <lot> [dépôt]   (lot : minuscules, chiffres, tirets — ex. f5, a2, coran-corrections)" >&2
  exit 2
fi
TAG="avant-$LOT"
cd "$DEPOT"
git rev-parse --verify --quiet main >/dev/null || { echo "branche main introuvable dans $DEPOT" >&2; exit 1; }
if git rev-parse --verify --quiet "refs/tags/$TAG" >/dev/null; then
  echo "l'étiquette $TAG existe déjà ($(git rev-parse --short "$TAG^{commit}")) : rien n'est changé" >&2
  exit 1
fi
SHA="$(git rev-parse --short main)"
git tag -a "$TAG" main -m "État de main avant la fusion du lot $LOT ($(date -Is))"
echo "étiquette $TAG posée sur main ($SHA)"
if git remote get-url origin >/dev/null 2>&1; then
  git push origin "refs/tags/$TAG" && echo "étiquette envoyée vers origin"
fi
