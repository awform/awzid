#!/bin/bash
# Awzid — renfort du tajwīd : chien de garde (consignes du coordinateur, 1/11). Toutes les 30 s : met en PAUSE le conteneur
# renfort-* en cours si la charge sur 1 min dépasse 12 depuis plus de 2 minutes, si la mémoire disponible passe sous 2 Go, ou si
# le disque atteint 87,5 % ; le relance quand tout est revenu sous les seuils (charge <= 8). S'arrête quand maitre.sh est fini.
O=$HOME/tajwid-renfort/sorties
J=$O/journal.log
haut=0
en_pause=0
while pgrep -f 'bash maitre.sh' > /dev/null; do
  c=$(cut -d' ' -f1 /proc/loadavg)
  mem=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
  t=$(df -B1M --output=used,avail / | tail -1 | awk '{printf "%.2f", 100*$1/($1+$2)}')
  if awk -v c="$c" 'BEGIN{exit !(c>12)}'; then haut=$((haut+1)); else haut=0; fi
  cond=""
  [ $haut -ge 5 ] && cond="charge $c > 12 depuis plus de 2 min"
  [ "$mem" -lt 2048 ] && cond="mémoire disponible $mem Mo < 2 Go"
  awk -v t="$t" 'BEGIN{exit !(t>=87.5)}' && cond="disque $t % >= 87,5 %"
  k=$(docker ps --format '{{.Names}}' | grep '^renfort-' | head -1)
  if [ -n "$cond" ] && [ -n "$k" ] && [ $en_pause = 0 ]; then
    docker pause "$k" > /dev/null && en_pause=1 && echo "$(date '+%F %T') PAUSE $k : $cond" >> "$J"
  elif [ -z "$cond" ] && [ $en_pause = 1 ] && awk -v c="$c" 'BEGIN{exit !(c<=8)}'; then
    for k2 in $(docker ps --filter status=paused --format '{{.Names}}' | grep '^renfort-'); do docker unpause "$k2" > /dev/null; done
    en_pause=0; echo "$(date '+%F %T') REPRISE (charge $c, mémoire $mem Mo, disque $t %)" >> "$J"
  fi
  sleep 30
done
for k2 in $(docker ps --filter status=paused --format '{{.Names}}' | grep '^renfort-'); do docker unpause "$k2" > /dev/null; done
