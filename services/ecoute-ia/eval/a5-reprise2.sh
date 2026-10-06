#!/bin/bash
# A5 — direct avec passages plus longs (pause 0,6 s, coupe à 25 s), puis service (réserve de modèles)
cd ~/awform-a5/services/ecoute-ia/eval
{ date; echo "== direct p06"; TAG=-p06 SCRIPT=direct_sim.py bash lancer.sh nemo_rnnt; date; echo "== fin direct p06"; } >> ~/a5/eval/journal.log 2>&1
bash chaine3.sh
