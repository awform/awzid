#!/bin/bash
# A5 — reprise des calculs lourds (après la fenêtre réservée au chantier Coran) : chaque étape sous le verrou.
cd ~/awform-a5/services/ecoute-ia/eval
L=~/a5/eval/journal.log
{
  date; echo "== vitesse"; bash lancer.sh vitesse
  date; echo "== direct"; SCRIPT=direct_sim.py bash lancer.sh nemo_rnnt
  date; echo "== fin calculs"
} >> $L 2>&1
bash chaine3.sh
