#!/bin/bash
# Awzid — renfort du tajwīd : décodage de QDAT / qdat_bench (fautes réelles d'apprenants), sous le verrou partagé de la VM.
#   bash lancer_qdat.sh qdat|bench
set -u
# Verrou : par défaut flock exclusif ; SANS_VERROU=1 (accord du coordinateur, 1/11 : un seul travail à la fois hors verrou,
# charge sur 1 min <= 6 avant de lancer) supprime le verrou.
if [ "${SANS_VERROU:-0}" = 1 ]; then VERROU=; else VERROU="flock $HOME/.awzid-e2e.lock"; fi
R=$(cd "$(dirname "$0")" && pwd)
IMG=${IMG:-awzid/ecoute-ia:9823ec5}
OUT=$HOME/tajwid-renfort/sorties
mkdir -p "$OUT"
$VERROU ionice -c3 nice -n 19 docker run --rm --name "renfort-qdat-$1" \
  --cpus 3 --cpu-shares 2 --blkio-weight 10 --memory 6g --memory-swap 6g -u "$(id -u):$(id -g)" \
  -e THREADS=3 -e OMP_NUM_THREADS=3 -e MKL_NUM_THREADS=3 -e QUANT=int8 -e HF_HUB_OFFLINE=1 \
  -e REMESURER="${REMESURER:-0}" -e MAX_REP="${MAX_REP:-4}" -e HOME=/tmp -e NUMBA_CACHE_DIR=/tmp -e MPLCONFIGDIR=/tmp \
  -v "$HOME/tajwid-donnees:/d:ro" -v "$HOME/tajwid-decodage/p:/p:ro" \
  -v "${AWFORM_CONTENT_DIR:-$HOME/awform-content}:/content:ro" \
  -v "$HOME/modeles-ia/obadx_muaalem-model-v3_2:/muaalem:ro" \
  -v "$R:/r:ro" -v "$R/../calibration:/calibration:ro" -v "$OUT:/out" \
  --entrypoint nice "$IMG" -n 19 python -I -W ignore /r/qdat_decoder.py "$1"
rc=$?
echo "$(date '+%F %T') qdat-$1 rc=$rc" >> "$OUT/journal.log"
exit $rc
