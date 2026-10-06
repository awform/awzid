#!/bin/bash
# après la chaîne principale : simulation du suivi en direct (sous le verrou)
cd ~/awform-a5/services/ecoute-ia/eval
while pgrep -f 'eval/chaine.sh' > /dev/null; do sleep 20; done
{ date; echo "== direct"; SCRIPT=direct_sim.py bash lancer.sh nemo nemo_rnnt; date; echo "== fin direct"; } >> ~/a5/eval/journal.log 2>&1
