#!/usr/bin/env bash
# Construction REPRODUCTIBLE de l'APK de DÉBOGAGE (lot 16) — sans compte Google, sans clé de signature de
# publication (clé de débogage générée localement par Gradle, jamais versionnée).
#   ANDROID_HOME=~/android-sdk [AWFORM_ANDROID_URL=https://…] infra/android/build-debug.sh
# Prérequis : infra/android/setup-sdk.sh (une fois, par une personne : licence du SDK).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[ -n "${ANDROID_HOME:-}" ] || { echo "ANDROID_HOME absent : lancer d'abord infra/android/setup-sdk.sh"; exit 1; }
[ -d "$ANDROID_HOME/licenses" ] || { echo "Licence du SDK Android non acceptée : lancer infra/android/setup-sdk.sh"; exit 1; }
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"
cd "$ROOT"
pnpm install --frozen-lockfile
cd apps/android
npx cap sync android
cd android
# horodatage figé : deux constructions du même commit donnent le même contenu
SOURCE_DATE_EPOCH="$(git -C "$ROOT" log -1 --format=%ct)"
export SOURCE_DATE_EPOCH
./gradlew --no-daemon --offline assembleDebug || ./gradlew --no-daemon assembleDebug
APK="app/build/outputs/apk/debug/app-debug.apk"
sha256sum "$APK"
echo "APK de débogage : apps/android/android/$APK (à installer sur un téléphone de test : adb install)"