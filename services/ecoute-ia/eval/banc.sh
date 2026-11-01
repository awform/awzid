#!/bin/bash
# Banc du suivi de la récitation (voir banc.py). Sous le verrou commun des calculs lourds de la VM.
# Usage : bash banc.sh sessions | lire base | lire fen
# Variables : CPUS (4), TAG, LIMITE, PAS, QUOTAS, PORTIONS, FEN_W, FEN_HOP, FEN_PAD, IMAGE, BANC_DIR
set -e
R=$(cd "$(dirname "$0")/.." && pwd)
B=${BANC_DIR:-$HOME/tarteel2-banc}
M=$HOME/modeles-ia
CPUS=${CPUS:-4}
mkdir -p "$B"
VERROU=(flock "$HOME/.awzid-e2e.lock")
[ -n "${DEJA_SOUS_VERROU:-}" ] && VERROU=()   # appelé depuis un script qui tient déjà le verrou commun
exec "${VERROU[@]}" docker run --rm --cpus "$CPUS" -u "$(id -u):$(id -g)" --entrypoint nice \
  -e THREADS="$CPUS" -e OMP_NUM_THREADS="$CPUS" -e MKL_NUM_THREADS="$CPUS" -e OMP_WAIT_POLICY=PASSIVE \
  -e BANC=/work -e TAG="${TAG:-}" -e LIMITE="${LIMITE:-0}" -e PAS="${PAS:-1}" -e PORTIONS="${PORTIONS:-3}" \
  -e QUOTAS="${QUOTAS:-juste:15,oubli:6,remplacement:6,ajout:5,saut_verset:5,repete:6,reprise:6,retour:5,pause:6,bruit:8,telephone:8}" \
  -e FEN_W="${FEN_W:-10}" -e FEN_HOP="${FEN_HOP:-0.5}" -e FEN_PAD="${FEN_PAD:-0.5}" \
  -e HOME=/tmp -e NUMBA_CACHE_DIR=/tmp -e MPLCONFIGDIR=/tmp -e HF_HOME=/tmp/hf -e HF_HUB_OFFLINE=1 \
  -v "$HOME/coran-audio-source:/src:ro" -v "$HOME/a1-rapports:/rapports:ro" \
  -v "${AWFORM_CONTENT_DIR:-$HOME/awform-content}:/content:ro" \
  -v "$M/nvidia_stt_ar_fastconformer_hybrid_large_pcd_v1.0:/model:ro" \
  -v "$R:/code:ro" -v "$B:/work" \
  "${IMAGE:-awzid/ecoute-ia:d8bc753}" -n 10 python -W ignore /code/eval/banc.py "$@"
