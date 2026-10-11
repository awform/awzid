#!/bin/bash
# enchaîne les étapes de l'évaluation (chacune prend et rend le verrou)
cd ~/awform-a5/services/ecoute-ia/eval
L=~/a5/eval/journal.log
mkdir -p ~/a5/eval
{
  date; echo "== fumee"; SCRIPT=fumee.py bash lancer.sh nemo_rnnt whisper
  date; echo "== preparer"; bash lancer.sh preparer || exit 1
  date; echo "== nemo"; bash lancer.sh transcrire nemo
  date; echo "== nemo_rnnt"; bash lancer.sh transcrire nemo_rnnt
  date; echo "== whisper"; CONDITIONS=propre,telephone bash lancer.sh transcrire whisper
  date; echo "== vitesse"; bash lancer.sh vitesse
  date; echo "== fin"
} >> $L 2>&1
