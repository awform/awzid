#!/usr/bin/env bash
# Garde-fous du dépôt (audit QUA-1), lancés par la CI et utilisables à la main depuis la racine d'un dépôt git :
#  - aucune normalisation Unicode dans le code (le texte coranique reste octet pour octet, CDC § 3.1) ;
#  - aucun fichier .env suivi par git (aucun secret dans le dépôt).
# Chaque contrôle échoue EXPLICITEMENT (un « ! commande » ne fait jamais échouer un script bash -e).
set -euo pipefail
echec=0
if git grep -nE '\.normalize\(' -- '*.ts' '*.js' '*.mjs' '*.svelte' ':!**/node_modules/**'; then
  echo "ERREUR : normalisation Unicode interdite (voir ci-dessus)." >&2
  echec=1
fi
if git ls-files | grep -E '(^|/)\.env$'; then
  echo "ERREUR : fichier .env suivi par git (secret)." >&2
  echec=1
fi
exit "$echec"
