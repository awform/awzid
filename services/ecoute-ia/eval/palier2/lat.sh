#!/bin/bash
# usage: lat.sh <cpus> <threads> <tag> [pas]  : relit des séances du banc neutre en mode fenêtre (10 s, pas 1 s) avec cette allocation (prod : 1.5 cpu, 1 thread)
CP=$1; TH=$2; TAG=$3; PAS=${4:-20}
B=$HOME/tarteel3-banc-neutre
R=$HOME/wt/tarteel-3/services/ecoute-ia
M=$HOME/modeles-ia
docker run --rm --cpus $CP --memory 6g -u "$(id -u):$(id -g)" --entrypoint nice \
  -e THREADS=$TH -e OMP_NUM_THREADS=$TH -e MKL_NUM_THREADS=$TH -e OMP_WAIT_POLICY=PASSIVE \
  -e BANC=/work -e TAG=$TAG -e LIMITE=0 -e PAS=$PAS -e PORTIONS=8 -e FEN_W=10 -e FEN_HOP=1 -e FEN_PAD=0.5 \
  -e HOME=/tmp -e NUMBA_CACHE_DIR=/tmp -e MPLCONFIGDIR=/tmp -e HF_HOME=/tmp/hf -e HF_HUB_OFFLINE=1 \
  -v "$HOME/awform-content:/content:ro" -v "$M/nvidia_stt_ar_fastconformer_hybrid_large_pcd_v1.0:/model:ro" \
  -v "$R:/code:ro" -v "$B:/work" \
  awzid/ecoute-ia:12e1c31 -n 10 python -W ignore /code/eval/banc.py lire fen
