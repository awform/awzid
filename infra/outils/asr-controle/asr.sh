#!/bin/bash
# Contrôle ASR (lecture seule) : bash asr.sh id1 id2 ... (puis bash voisins.sh id1 id2 ...)
# Correspondance fichier → verset : rapport du verifier ~/a1-rapports/verifier-<id>.json s'il existe.
mkdir -p ~/asr-controle/out
docker run --rm --name asr-controle --cpus 7 -e THREADS=7 \
  -v ~/coran-audio-source:/src:ro \
  -v ~/modeles-ia/nvidia_stt_ar_fastconformer_hybrid_large_pcd_v1.0:/model:ro \
  -v ~/complexe-ressources/textes-riwayat:/textes:ro \
  -v ~/a1-rapports:/rapports:ro \
  -v ~/asr-controle/out:/out \
  -v ~/asr-controle/asr_controle.py:/work/asr_controle.py:ro \
  awzid/asr-nemo python /work/asr_controle.py "$@"
