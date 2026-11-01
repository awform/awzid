#!/bin/bash
# Awzid — renfort du tajwīd : traite une voix dans un conteneur jetable, sous le verrou partagé de la VM.
#   bash lancer_voix.sh VOIX MODE [N_FAUTES] [DOSSIER_EVERYAYAH]
# Variables : SOURATES (défaut 78-114), FRACTION (mode complexe), TYPES (fautes), EFFACER_AUDIO=1 (supprime les mp3 de la voix
# après traitement, pour tenir sous 90 % de disque), IMG.
set -u
# Verrou : par défaut flock exclusif ; SANS_VERROU=1 (accord du coordinateur, 1/11 : un seul travail à la fois hors verrou,
# charge sur 1 min <= 6 avant de lancer) supprime le verrou.
if [ "${SANS_VERROU:-0}" = 1 ]; then VERROU=; else VERROU="flock $HOME/.awzid-e2e.lock"; fi
VOIX=$1; MODE=$2; NF=${3:-10}; DOSSIER=${4:-}
R=$(cd "$(dirname "$0")" && pwd)
IMG=${IMG:-awzid/ecoute-ia:9823ec5}
OUT=$HOME/tajwid-renfort/sorties
mkdir -p "$OUT"
$VERROU ionice -c3 nice -n 19 docker run --rm --name "renfort-$VOIX" \
  --cpus 3 --cpu-shares 2 --blkio-weight 10 --memory 6g --memory-swap 6g -u "$(id -u):$(id -g)" \
  -e THREADS=3 -e OMP_NUM_THREADS=3 -e MKL_NUM_THREADS=3 -e QUANT=int8 -e HF_HUB_OFFLINE=1 \
  -e HOME=/tmp -e NUMBA_CACHE_DIR=/tmp -e MPLCONFIGDIR=/tmp \
  -e DOSSIER="$DOSSIER" -e SOURATES="${SOURATES:-78-114}" -e FRACTION="${FRACTION:-1}" -e TYPES="${TYPES:-}" -e REFAIRE="${REFAIRE:-0}" -e REMESURER="${REMESURER:-0}" -e MAX_REP="${MAX_REP:-4}" \
  -v "$HOME/tajwid-donnees/everyayah:/ea:ro" -v "$HOME/coran-audio-source:/src:ro" \
  -v "$HOME/tajwid-decodage/work/cache8:/cache8:ro" -v "$HOME/tajwid-decodage/p:/p:ro" \
  -v "${AWFORM_CONTENT_DIR:-$HOME/awform-content}:/content:ro" \
  -v "$HOME/modeles-ia/obadx_muaalem-model-v3_2:/muaalem:ro" \
  -v "$R:/r:ro" -v "$R/../calibration:/calibration:ro" -v "$OUT:/out" \
  --entrypoint nice "$IMG" -n 19 python -I -W ignore /r/pipeline_voix.py "$VOIX" "$MODE" "$NF"
rc=$?
echo "$(date '+%F %T') $VOIX rc=$rc" >> "$OUT/journal.log"
if [ "$rc" = 0 ] && [ "${EFFACER_AUDIO:-0}" = 1 ] && [ -n "$DOSSIER" ]; then
  rm -f "$HOME/tajwid-donnees/everyayah/$DOSSIER"/*.mp3 && echo "$(date '+%F %T') $VOIX audio effacé" >> "$OUT/journal.log"
fi
exit $rc
