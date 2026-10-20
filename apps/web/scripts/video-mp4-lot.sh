#!/usr/bin/env bash
# Vidéos vivantes v2 — fabrication EN LOT des MP4 d'un niveau (sur la VM).
#
#   scripts/video-mp4-lot.sh <niveau> [modes] [formats] [unités]
#   ex. : scripts/video-mp4-lot.sh ad1                      (versions courtes, 3 formats, 25 unités)
#         scripts/video-mp4-lot.sh ad1 courte,lettre 9x16    (vertical seulement)
#         scripts/video-mp4-lot.sh ad2 courte 9x16,1x1 l01,l02
#
# Modes : courte (défaut), lettre, quiz, longue, revision. Formats : 9x16, 16x9, 1x1 (défaut : les trois).
# Sortie : ~/videos-vivantes/Videos_Vivantes_<niveau>/ (ou VIDEO_MP4_SORTIE) : pour chaque film, le MP4, ses
# sous-titres (.fr.srt) et son journal (.json : sons, chapitres YouTube, mesure du son), puis lot.json (résumé).
# Copie sur le Bureau du client : scripts/video-mp4-lot.ps1 (Windows), qui lance ce script puis copie le dossier.
#
# Prérequis : application construite (pnpm build), PostgreSQL, ffmpeg, audio des leçons dans ~/lecons-audio (lu,
# jamais modifié). Les films sont faits par e2e/video-mp4.spec.ts (Playwright, base de test isolée de ce dossier).
# Navigateurs en parallèle : VIDEO_MP4_NAVIGATEURS (3 par défaut ; la capture se fait en temps réel).
set -euo pipefail
NIVEAU="${1:?niveau attendu (ad1, ad2…)}"
MODES="${2:-courte}"
FORMATS="${3:-9x16,16x9,1x1}"
UNITES="${4:-}"
case "$NIVEAU" in *[!a-z0-9]*) echo "niveau invalide : $NIVEAU" >&2; exit 2 ;; esac
WEB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SORTIE="${VIDEO_MP4_SORTIE:-$HOME/videos-vivantes/Videos_Vivantes_$NIVEAU}"
mkdir -p "$SORTIE"
[ -f "$WEB/../api/dist/server.js" ] || { echo "application non construite : pnpm build" >&2; exit 2; }
command -v ffmpeg >/dev/null || { echo "ffmpeg absent" >&2; exit 2; }

echo "Lot $NIVEAU · modes $MODES · formats $FORMATS${UNITES:+ · unités $UNITES} → $SORTIE"
debut=$(date +%s)
cd "$WEB"
set +e
VIDEO_MP4="$SORTIE" VIDEO_MP4_NIVEAU="$NIVEAU" VIDEO_MP4_MODES="$MODES" VIDEO_MP4_FORMATS="$FORMATS" \
  VIDEO_MP4_UNITES="$UNITES" E2E_LECONS_NIVEAUX="${E2E_LECONS_NIVEAUX:-$NIVEAU}" \
  npx playwright test e2e/video-mp4.spec.ts --project=mobile-chromium \
  --workers="${VIDEO_MP4_NAVIGATEURS:-3}" --retries=1 --reporter=list
code=$?
set -e
rm -rf "$SORTIE/_brut"

# résumé du lot : un film par ligne (durée, intensité, chapitres, sous-titres, scènes sans son)
node -e '
const fs = require("fs"), path = require("path");
const dir = process.argv[1];
const films = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "lot.json").sort()
  .map((f) => ({ f, j: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }))
  .filter(({ j }) => j.version === "v2");
const lignes = films.map(({ f, j }) => ({
  film: f.replace(/\.json$/, ".mp4"),
  duree_s: j.duree_s,
  lufs: j.son?.apres?.I_LUFS,
  crete_dbfs: j.son?.apres?.crete_dBFS,
  chapitres: j.chapitres_youtube?.length ?? 0,
  sous_titres: j.sous_titres,
  sons_absents: j.absents,
  scenes_sans_son: (j.scenes_sans_son ?? []).length,
  reductions: (j.reductions ?? []).length,
}));
fs.writeFileSync(path.join(dir, "lot.json"), JSON.stringify({ date: new Date().toISOString(), films: lignes }, null, 1));
console.table(lignes);
console.log(`${lignes.length} films dans ${dir}`);
' "$SORTIE"
echo "Durée du lot : $(( ($(date +%s) - debut) / 60 )) min (code $code)"
exit $code
