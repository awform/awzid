#!/bin/bash
# Second passage (voisins) après asr.sh : bash voisins.sh id1 id2 ...
docker run --rm --name asr-voisins --cpus 7 -e THREADS=7 \
  -v ~/coran-audio-source:/src:ro \
  -v ~/modeles-ia/nvidia_stt_ar_fastconformer_hybrid_large_pcd_v1.0:/model:ro \
  -v ~/complexe-ressources/textes-riwayat:/textes:ro \
  -v ~/a1-rapports:/rapports:ro \
  -v ~/asr-controle/out:/out \
  -v ~/asr-controle/asr_controle.py:/work/asr_controle.py:ro \
  -v ~/asr-controle/voisins.py:/work/voisins.py:ro \
  awzid/asr-nemo python /work/voisins.py "$@"
