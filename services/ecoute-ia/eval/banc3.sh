#!/bin/bash
# Banc 3 (phase 3 Tarteel) : voix JAMAIS utilisées pour le réglage. verif = Basfar + Muhsin al-Qasim ; neutre = al-Ajamy + Hani ar-Rifai.
set -e
E=~/wt/tarteel-3/services/ecoute-ia/eval
export CPUS=3 MEMOIRE=6g NICE=19 CHARGE_MAX=6 DEJA_SOUS_VERROU=1 IMAGE=awzid/ecoute-ia:d8bc753
export RECITANTS_COMPLEXE= PORTIONS=8 TOPK=1 TOPK_K=16 FEN_HOP=1 FEN_W=10
export QUOTAS=juste:25,oubli:22,remplacement:22,ajout:22,saut_verset:22,repete:10,reprise:12,retour:12
for part in verif neutre; do
  if [ $part = verif ]; then export RECITANTS_EA=Abdullah_Basfar_192kbps,Muhsin_Al_Qasim_192kbps GRAINE=301 PREFIXE=v
  else export RECITANTS_EA=Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net,Hani_Rifai_192kbps GRAINE=302 PREFIXE=n; fi
  export BANC_DIR=~/tarteel3-banc-$part
  mkdir -p $BANC_DIR
  if [ ! -s $BANC_DIR/sessions.done ]; then
    NOM_CONTENEUR=t3-sess-$part SCRIPT=banc2.py bash $E/banc.sh sessions > $BANC_DIR/sessions.log 2>&1
    echo ok > $BANC_DIR/sessions.done
  fi
  if [ ! -s $BANC_DIR/lire.done ]; then
    NOM_CONTENEUR=t3-lire-$part TAG= bash $E/banc.sh lire fen > $BANC_DIR/lire.log 2>&1
    echo fini > $BANC_DIR/lire.done
  fi
done
