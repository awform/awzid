#!/usr/bin/env bash
# Boîte de DÉMONSTRATION des e-mails (lot F3) : la démo n'envoie aucun vrai e-mail (AWFORM_MAIL=journal) ;
# chaque message est un fichier JSON du volume « boite » de l'API. Ce script montre les derniers messages.
#   infra/prod/boite-demo.sh            → les 10 derniers (date, destinataire, objet)
#   infra/prod/boite-demo.sh --dernier  → le dernier message en entier (texte, avec le lien)
#   infra/prod/boite-demo.sh --vider    → efface la boîte
set -euo pipefail
PROD="$(cd "$(dirname "$0")" && pwd)"
export AWFORM_ENV_DIR="${AWFORM_ENV_DIR:-$HOME/.config/awform}"
DC=(docker compose -f "$PROD/compose.yml")
LIRE='const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));'
case "${1:-}" in
  --vider)
    "${DC[@]}" exec -T api find /boite -name '*.json' -delete && echo "boîte vidée" ;;
  --dernier)
    f="$("${DC[@]}" exec -T api sh -c 'ls -1 /boite/*.json 2>/dev/null | tail -1')"
    [ -n "$f" ] || { echo "boîte vide"; exit 0; }
    "${DC[@]}" exec -T api node -e "$LIRE console.log(m.date+'\n'+m.to+'\n'+m.subject+'\n\n'+m.text)" "$f" ;;
  *)
    for f in $("${DC[@]}" exec -T api sh -c 'ls -1 /boite/*.json 2>/dev/null | tail -10'); do
      "${DC[@]}" exec -T api node -e "$LIRE console.log([m.date,m.to,m.subject].join('  |  '))" "$f"
    done ;;
esac
