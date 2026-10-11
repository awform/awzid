#!/usr/bin/env bash
# (sur le serveur) modèle d'écoute A5 téléchargé depuis sa source publique (dépôt NVIDIA sur Hugging Face,
# licence CC-BY-4.0, LICENCES.md § 9) et contrôlé par l'empreinte SHA-256 de la copie en service sur la VM
# de dev ; refusé si elle diffère.
#   bash infra/gcp/modele-ecoute.sh <sha256 attendu>
set -euo pipefail
ATT="${1:?empreinte attendue}"
NOM=stt_ar_fastconformer_hybrid_large_pcd_v1.0
D="$HOME/modeles-ia/nvidia_$NOM"
URL="https://huggingface.co/nvidia/$NOM/resolve/main/$NOM.nemo"
mkdir -p "$D"
if [ -f "$D/$NOM.nemo" ] && [ "$(sha256sum "$D/$NOM.nemo" | cut -c1-64)" = "$ATT" ]; then echo "modèle déjà présent (empreinte ok)"; exit 0; fi
curl -fsSL --retry 3 -o "$D/$NOM.nemo.part" "$URL"
GOT="$(sha256sum "$D/$NOM.nemo.part" | cut -c1-64)"
if [ "$GOT" != "$ATT" ]; then rm -f "$D/$NOM.nemo.part"; echo "ÉCHEC : empreinte différente ($GOT)"; exit 1; fi
mv "$D/$NOM.nemo.part" "$D/$NOM.nemo"
curl -fsSL -o "$D/README.md" "https://huggingface.co/nvidia/$NOM/resolve/main/README.md" || true
chmod -R a+rX "$HOME/modeles-ia"
echo "modèle : $D/$NOM.nemo ($(stat -c %s "$D/$NOM.nemo") octets, empreinte identique à la VM de dev)"
