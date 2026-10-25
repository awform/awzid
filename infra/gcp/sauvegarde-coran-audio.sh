#!/usr/bin/env bash
# Copie de secours HORS SITE de l'audio du Coran (volume Docker awform_audio, ≈ 12 Gio, 9 récitateurs)
# vers gs://$CORAN_BUCKET/awform_audio (europe-west1, Coldline). À lancer SUR LE SERVEUR, idempotent :
#   bash ~/awform-app/infra/gcp/sauvegarde-coran-audio.sh              copie incrémentale + signalement + vérification
#   bash ~/awform-app/infra/gcp/sauvegarde-coran-audio.sh --verifier   vérification seule
# Variables : CORAN_ECHANTILLON (25 fichiers comparés octet à octet), CORAN_CPUS (1).
# Sécurité : le volume est monté EN LECTURE SEULE dans un conteneur temporaire (image de l'API déjà présente,
# gcloud de l'hôte monté en lecture seule, système de fichiers du conteneur en lecture seule) ; rien n'est
# écrit sur le serveur hors de /tmp. « --no-clobber » : un objet déjà copié n'est JAMAIS écrasé (le compte
# du serveur n'a d'ailleurs que objectCreator + objectViewer) ; un fichier modifié localement est SIGNALÉ.
set -euo pipefail
GCP="$(cd "$(dirname "$0")" && pwd)"
. "$GCP/config.sh"
CORAN_BUCKET="${CORAN_BUCKET:-awzid-coran-audio-b7e41c}"
VOLUME="${CORAN_VOLUME:-awform_audio}"
DEST="gs://$CORAN_BUCKET/$VOLUME"
N="${CORAN_ECHANTILLON:-25}"
D() { sudo docker "$@"; }

SRC="$(D volume inspect -f '{{.Mountpoint}}' "$VOLUME")"
CID="$(D ps -q --filter "volume=$VOLUME" | head -1)"
[ -n "$CID" ] || { echo "aucun conteneur n'utilise $VOLUME"; exit 1; }
IMG="$(D inspect -f '{{.Config.Image}}' "$CID")"
SDK="$(dirname "$(dirname "$(readlink -f "$(command -v gcloud)")")")"
# gcloud dans un conteneur jetable : volume et SDK en lecture seule, configuration en mémoire
gcl() {
  D run --rm --network host --read-only --cpus "${CORAN_CPUS:-1}" --memory 1g --tmpfs /tmp:size=256m \
    -e HOME=/tmp -e CLOUDSDK_CONFIG=/tmp/gc -e CLOUDSDK_CORE_DISABLE_PROMPTS=1 \
    -e CLOUDSDK_STORAGE_PROCESS_COUNT=1 -e CLOUDSDK_STORAGE_THREAD_COUNT=8 \
    -e CLOUDSDK_STORAGE_PARALLEL_COMPOSITE_UPLOAD_ENABLED=False \
    -v "$VOLUME:/src:ro" -v "$SDK:/sdk:ro" --entrypoint /sdk/bin/gcloud "$IMG" "$@"
}
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
date -Iseconds

if [ "${1:-}" != "--verifier" ]; then
  echo "== copie incrémentale $VOLUME -> $DEST (sans écrasement)"
  gcl storage rsync -r --no-clobber /src "$DEST" 2>&1 | grep -v 'Copying file\|Completed\|listed [0-9]\|^[. ]*$' || true
  echo "== fichiers modifiés depuis leur copie (non écrasés, à examiner)"
  gcl storage rsync -r --dry-run /src "$DEST" 2>&1 | grep -i 'would copy' | tee "$T/modifies" || true
  [ -s "$T/modifies" ] && echo "ATTENTION : $(wc -l < "$T/modifies") fichier(s) modifié(s) localement" || echo "aucun"
fi

echo "== vérification : liste chemin + taille, local contre bucket"
sudo find "$SRC" -type f -printf '%P %s\n' | LC_ALL=C sort > "$T/local"
gcl storage ls -l -r "$DEST/**" | awk -v p="$DEST/" '$3 ~ /^gs:/ { sub(p, "", $3); print $3, $1 }' \
  | LC_ALL=C sort > "$T/distant"
nl=$(wc -l < "$T/local"); nd=$(wc -l < "$T/distant")
sl=$(awk '{s+=$2} END {printf "%.0f", s}' "$T/local"); sd=$(awk '{s+=$2} END {printf "%.0f", s}' "$T/distant")
echo "local : $nl fichiers, $sl octets ; bucket : $nd objets, $sd octets"
OK=1
if ! diff -q "$T/local" "$T/distant" >/dev/null; then
  OK=0; echo "ÉCART (10 premières lignes, < local / > bucket) :"; diff "$T/local" "$T/distant" | head -10
fi
echo "== échantillon : $N fichiers relus depuis le bucket, sha256 comparés"
bad=0
while read -r f _; do
  a="$(sudo sha256sum "$SRC/$f" | cut -d' ' -f1)"
  b="$(gcl storage cat "$DEST/$f" | sha256sum | cut -d' ' -f1)"
  [ "$a" = "$b" ] || { bad=$((bad + 1)); echo "DIFFÉRENT : $f"; }
done < <(shuf -n "$N" "$T/local")
echo "échantillon : $((N - bad))/$N identiques"
[ "$bad" -eq 0 ] || OK=0
[ "$OK" -eq 1 ] && echo "RÉSULTAT : copie conforme" || { echo "RÉSULTAT : ÉCHEC de la vérification"; exit 1; }
