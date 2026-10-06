#!/bin/bash
# A5 — évaluation des modèles d'écoute (LECTURE SEULE des récitations du Complexe), sous le verrou commun des
# calculs lourds de la VM ; 4 cœurs au plus. Usage : bash lancer.sh preparer | transcrire nemo | transcrire whisper
# | vitesse   (variables : W=dossier de travail, PORTIONS=portions par récitant, CONDITIONS=propre,telephone,aigue)
set -e
R=$(cd "$(dirname "$0")/.." && pwd)
W=${W:-$HOME/a5/eval}
mkdir -p "$W"
M=$HOME/modeles-ia
exec flock "$HOME/.awzid-e2e.lock" docker run --rm --cpus 4 -u "$(id -u):$(id -g)" \
  -e THREADS=4 -e OMP_NUM_THREADS=4 -e MKL_NUM_THREADS=4 -e PORTIONS="${PORTIONS:-8}" \
  -e CONDITIONS="${CONDITIONS:-propre,telephone,aigue}" \
  -e HOME=/tmp -e NUMBA_CACHE_DIR=/tmp -e MPLCONFIGDIR=/tmp -e HF_HOME=/tmp/hf \
  -v "$HOME/coran-audio-source:/src:ro" -v "$HOME/a1-rapports:/rapports:ro" \
  -v "${AWFORM_CONTENT_DIR:-$HOME/awform-content}:/content:ro" \
  -v "$M/nvidia_stt_ar_fastconformer_hybrid_large_pcd_v1.0:/model:ro" \
  -v "$M/tarteel-ai_whisper-base-ar-quran:/whisper:ro" \
  -v "$R:/code:ro" -v "$W:/work" \
  awzid/ecoute-ia-base python "/code/eval/${SCRIPT:-evaluer.py}" "$@"
