#!/usr/bin/env bash
# SDK Android en ligne de commande, pour construire la version de DÉBOGAGE de l'application (lot 16).
# ⚠ À LANCER PAR UNE PERSONNE (le fondateur ou son développeur) : ce script télécharge le SDK officiel de
#   Google et affiche la LICENCE du SDK Android, qu'il faut lire et accepter soi-même (sdkmanager --licenses).
#   Aucun compte Google n'est nécessaire pour la version de débogage.
# Versions épinglées (reproductible) : JDK 21, outils en ligne de commande 13114758, plateforme 35,
# build-tools 35.0.0. Usage : infra/android/setup-sdk.sh [dossier du SDK, défaut ~/android-sdk]
set -euo pipefail
SDK="${1:-${ANDROID_HOME:-$HOME/android-sdk}}"
TOOLS_ZIP="commandlinetools-linux-13114758_latest.zip"
URL="https://dl.google.com/android/repository/$TOOLS_ZIP"

sudo apt-get install -y --no-install-recommends openjdk-21-jdk-headless unzip
mkdir -p "$SDK/cmdline-tools"
TMP="$(mktemp -d)"
curl -fL --proto '=https' --tlsv1.2 -o "$TMP/$TOOLS_ZIP" "$URL"
echo "Empreinte SHA-256 du fichier téléchargé (à comparer avec celle publiée sur developer.android.com/studio) :"
sha256sum "$TMP/$TOOLS_ZIP"
read -r -p "L'empreinte est-elle identique ? (oui/non) " ok
[ "$ok" = "oui" ] || { echo "Arrêt."; exit 1; }
unzip -q -o "$TMP/$TOOLS_ZIP" -d "$TMP"
mkdir -p "$SDK/cmdline-tools/latest"
cp -a "$TMP/cmdline-tools/." "$SDK/cmdline-tools/latest/"
SM="$SDK/cmdline-tools/latest/bin/sdkmanager"
echo
echo "Lecture et acceptation de la licence du SDK Android (à faire vous-même) :"
"$SM" --sdk_root="$SDK" --licenses
"$SM" --sdk_root="$SDK" "platform-tools" "platforms;android-35" "build-tools;35.0.0"
echo
echo "SDK prêt dans $SDK. Pour construire : ANDROID_HOME=$SDK infra/android/build-debug.sh"