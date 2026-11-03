#!/bin/bash
# usage: run.sh <cpus> <threads> script.py [env...]   (prod : 1.5 cpu, 1 thread)
CP=$1; TH=$2; S=$3; shift 3
R=$HOME/wt/tarteel-3/services/ecoute-ia
docker run --rm --cpus $CP --memory 6g -u "$(id -u):$(id -g)" --entrypoint nice \
  -e TH=$TH -e OMP_NUM_THREADS=$TH -e MKL_NUM_THREADS=$TH -e OMP_WAIT_POLICY=PASSIVE "$@" \
  -e HOME=/tmp -e NUMBA_CACHE_DIR=/tmp -e MPLCONFIGDIR=/tmp -e HF_HOME=/tmp/hf -e HF_HUB_OFFLINE=1 \
  -v "$HOME/awform-content:/content:ro" -v "$HOME/modeles-ia/nvidia_stt_ar_fastconformer_hybrid_large_pcd_v1.0:/model:ro" \
  -v "$HOME/modeles-ia/quran-asr-small:/qas:ro" -v "$HOME/modeles-ia/tarteel-ai_whisper-base-ar-quran:/whisper:ro" \
  -v "$R:/code:ro" -v "$HOME/tarteel3-banc-neutre:/bn" -v "$HOME/tajwid-donnees:/q:ro" -v "$R/eval/palier3:/p3:ro" -v "$HOME/tarteel3-quran-small:/out" \
  awzid/ecoute-ia:12e1c31 -n 10 python -W ignore /p3/$S
