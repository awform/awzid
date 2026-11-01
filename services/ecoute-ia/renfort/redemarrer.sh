#!/bin/bash
# Awzid — renfort du tajwīd : arrête proprement la chaîne (maitre, garde, conteneur renfort-*) et la relance (un seul exemplaire).
#   bash redemarrer.sh [arret]
cd "$(dirname "$0")"
for p in $(pgrep -f 'bash maitre.sh') $(pgrep -f 'bash garde.sh') $(pgrep -f 'renfort/lancer_'); do kill "$p" 2>/dev/null; done
sleep 1
for k in $(docker ps -a --format '{{.Names}}' | grep '^renfort-'); do docker kill "$k" > /dev/null 2>&1; done
[ -f maitre.sh.new ] && mv maitre.sh.new maitre.sh && sed -i 's/\r$//;1s/^\xEF\xBB\xBF//' maitre.sh
[ "${1:-}" = arret ] && { echo arrêté; exit 0; }
setsid nohup bash maitre.sh > "$HOME/tajwid-renfort/maitre.out" 2>&1 < /dev/null &
sleep 3
setsid nohup bash garde.sh > "$HOME/tajwid-renfort/garde.out" 2>&1 < /dev/null &
sleep 1
pgrep -fa 'bash (maitre|garde).sh'
