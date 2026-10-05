#!/bin/bash
# attend la fin du premier passage, puis second passage (voisins) pour toutes les récitations
while docker ps --format '{{.Names}}' | grep -q '^asr-controle$'; do sleep 30; done
docker run --rm --name asr-voisins --cpus 7 -e THREADS=7 \
  -v ~/coran-audio-source:/src:ro \
  -v ~/modeles-ia/nvidia_stt_ar_fastconformer_hybrid_large_pcd_v1.0:/model:ro \
  -v ~/complexe-ressources/textes-riwayat:/textes:ro \
  -v ~/asr-controle/out:/out \
  -v ~/asr-controle/asr_controle.py:/work/asr_controle.py:ro \
  -v ~/asr-controle/voisins.py:/work/voisins.py:ro \
  awzid/asr-nemo python /work/voisins.py ayyoub-hafs huthify-hafs muhanna-hafs sediki-susi juhani-duri huthify-shuba muaiqly-hafs akhdar-hafs huthify-qalun
echo VOISINS_FINI
