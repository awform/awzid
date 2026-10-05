#!/bin/bash
# Contrôle ASR (lecture seule) : bash asr.sh id1 id2 ...
mkdir -p ~/asr-controle/out
docker run --rm --name asr-controle --cpus 7 -e THREADS=7 \
  -v ~/coran-audio-source:/src:ro \
  -v ~/modeles-ia/nvidia_stt_ar_fastconformer_hybrid_large_pcd_v1.0:/model:ro \
  -v ~/complexe-ressources/textes-riwayat:/textes:ro \
  -v ~/asr-controle/out:/out \
  -v ~/asr-controle/asr_controle.py:/work/asr_controle.py:ro \
  awzid/asr-nemo python /work/asr_controle.py "$@"
