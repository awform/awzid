#!/usr/bin/env bash
# Menu d'exploitation du serveur de bêta, pour le client (guide : docs/exploitation/GUIDE_SURVIE.md).
#   bash ~/awform-app/infra/prod/awzid-menu.sh
# Il n'ajoute AUCUNE logique : chaque choix appelle un script ou une commande déjà en place et documentée
# (docs/projet/EXPLOITATION.md) ; toute action qui change quelque chose demande d'abord « o » (oui).
# Il ne lit ni n'affiche aucun secret (~/.config/awform/*.env, clés).
set -uo pipefail
PROD="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$PROD/../.." && pwd)"
CONF="$HOME/.config/awform"

confirmer() {
  local r
  read -r -p "$1 Confirmer ? (o/N) " r
  case "$r" in o | O | oui | OUI | Oui) return 0 ;; *) echo "Annulé : rien n'a changé." ;; esac
  return 1
}

pause() {
  read -r -p "Appuie sur Entrée pour revenir au menu… " _
}

version_en_service() {
  cat "$CONF/version-en-service" 2>/dev/null || echo "inconnue"
}

etat() {
  if bash "$PROD/status.sh"; then
    echo "=> Tout va bien."
  else
    echo "=> Au moins une ALERTE ci-dessus : voir le guide, fiche « J'ai reçu une alerte »."
  fi
}

sauvegardes() {
  if bash "$PROD/backup-status.sh"; then
    echo "=> Sauvegardes en ordre."
  else
    echo "=> Au moins une ALERTE ci-dessus : voir le guide, fiche « Vérifier les sauvegardes »."
  fi
}

redemarrer() {
  echo "Redémarre tous les services du site (base, API, travailleur, site web, Caddy) : coupure d'environ une minute."
  confirmer "Redémarrer maintenant ?" || return 0
  # service systemd posé par deploy.sh (même version, mêmes réglages qu'au dernier déploiement)
  if sudo systemctl restart awform.service; then
    echo "Services redémarrés. Vérification dans 10 secondes :"
    sleep 10
    etat
  else
    echo "Le redémarrage a échoué : voir le guide, fiche « Le site ne répond plus »."
  fi
}

version_precedente() {
  local actuelle prec versions choix
  actuelle="$(version_en_service)"
  echo "Version en service : $actuelle"
  # versions encore présentes sur le serveur (images déjà tirées), la plus récente d'abord
  mapfile -t versions < <(docker image ls awform/api --format '{{.Tag}}' | grep -v -x -e "$actuelle" -e latest -e local -e '<none>' | awk '!vu[$0]++')
  if [ "${#versions[@]}" -eq 0 ]; then
    echo "Aucune autre version n'est présente sur le serveur : retour arrière impossible d'ici (voir le guide)."
    return 0
  fi
  echo "Versions disponibles (la plus récente d'abord) :"
  docker image ls awform/api --format '  {{.Tag}}  (reçue {{.CreatedSince}})' | grep -v -e " $actuelle " -e ' latest ' -e ' local ' -e '<none>'
  prec="${versions[0]}"
  read -r -p "Version à remettre en service [$prec] : " choix
  choix="${choix:-$prec}"
  if ! printf '%s\n' "${versions[@]}" | grep -q -x -- "$choix"; then
    echo "Version inconnue : $choix. Rien n'a changé."
    return 0
  fi
  echo "Remettre la version $choix (sauvegarde automatique avant, la base de données reste telle quelle)."
  confirmer "Revenir à la version $choix ?" || return 0
  # même chemin qu'une mise à jour (EXPLOITATION § 15 « Mise à jour »), avec l'ancienne version
  AWFORM_VERSION="$choix" bash "$ROOT/infra/gcp/deployer-beta.sh"
}

fermer_rouvrir() {
  cat <<'EOF'
Fermer ou rouvrir le site se fait depuis l'ESPACE ADMINISTRATEUR, pas depuis ce menu :
  1. ouvre le site et connecte-toi avec le compte administrateur (second facteur) ;
  2. Administration → « Accès à la bêta » ;
  3. bouton « Fermer le site » (page de maintenance pour tous, sauf les administrateurs),
     ou choisis de nouveau le mode d'avant pour rouvrir (effet en moins de 5 secondes).
Si l'espace administrateur ne répond plus : voir le guide, fiche « Le site ne répond plus ».
EOF
}

while true; do
  cat <<EOF

========== Awzid : menu du serveur ==========
Version en service : $(version_en_service)
  1) État du site
  2) Vérifier les sauvegardes
  3) Redémarrer les services
  4) Revenir à la version précédente
  5) Fermer ou rouvrir le site (explication)
  6) Quitter
EOF
  read -r -p "Ton choix (1-6) : " c || exit 0
  case "$c" in
    1) etat; pause ;;
    2) sauvegardes; pause ;;
    3) redemarrer; pause ;;
    4) version_precedente; pause ;;
    5) fermer_rouvrir; pause ;;
    6 | q | Q) exit 0 ;;
    *) echo "Choix inconnu : tape un chiffre de 1 à 6." ;;
  esac
done
