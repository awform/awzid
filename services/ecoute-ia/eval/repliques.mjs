// Tuteur IA de conversation, étage 1 (19/10/2026, TUTEUR_IA.md § 11) : coût de calcul d'ecoute-ia PAR RÉPLIQUE de
// dialogue des livres, et part des mots reconnus. Audio : MP3 des leçons déjà générés (une réplique par fichier).
// Le service d'écoute doit tourner (ex. conteneur `awzid/ecoute-ia`, port 127.0.0.1:18765, réglages de la bêta :
// 1,5 CPU, 1 fil, 1 calcul). Aucun appel externe.
// Usage : node services/ecoute-ia/eval/repliques.mjs [niveaux=ad2,ad3,ado2,en2] [nombre=60]
// Variables : AWFORM_DEPOT (racine du dépôt, défaut ~/wt/tuteur), AWFORM_LECONS_AUDIO (défaut ~/lecons-audio),
// ECOUTE_URL (défaut http://127.0.0.1:18765).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const W = process.env.AWFORM_DEPOT ?? join(homedir(), 'wt', 'tuteur');
const AUDIO = process.env.AWFORM_LECONS_AUDIO ?? join(homedir(), 'lecons-audio');
const URL = process.env.ECOUTE_URL ?? 'http://127.0.0.1:18765';
const { audioFileId } = await import(join(W, 'packages/content/dist/audio-cle.js'));
const { bare } = await import(join(W, 'packages/content/dist/text.js'));
const niveaux = (process.argv[2] ?? 'ad2,ad3,ado2,en2').split(',');
const max = Number(process.argv[3] ?? 60);

const lignes = [];
for (const n of niveaux) {
  const dir = join(W, 'packages/content/conversation', n);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).sort()) {
    const s = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const t of s.tours) {
      const ar = t.t === 'partenaire' ? t.ar : t.choix.find((c) => c.kind === 'bonne')?.ar;
      const id = ar && audioFileId(ar);
      const p = id && join(AUDIO, `${id}.mp3`);
      if (p && existsSync(p)) lignes.push({ ar, p });
    }
  }
}
// échantillon déterministe, réparti sur les niveaux
const pas = Math.max(1, Math.floor(lignes.length / max));
const ech = lignes.filter((_, i) => i % pas === 0).slice(0, max);
const mots = (s) =>
  s
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/[\s،؟!.:؛«»"'…,?-]+/u)
    .map(bare)
    .filter(Boolean);
const res = [];
for (const l of ech) {
  const t0 = performance.now();
  const r = await fetch(`${URL}/ecouter`, {
    method: 'POST',
    headers: { 'content-type': 'audio/mpeg' },
    body: readFileSync(l.p),
  });
  const ms = performance.now() - t0;
  const j = await r.json();
  if (!r.ok) continue;
  const att = mots(l.ar);
  const ent = new Set(j.mots.map((m) => bare(m.w)));
  res.push({
    duree: j.duree,
    calcul: j.calcul,
    ms,
    att: att.length,
    justes: att.filter((w) => ent.has(w)).length,
  });
}
const q = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
const tot = (k) => res.reduce((s, r) => s + r[k], 0);
console.log(
  JSON.stringify(
    {
      repliques: res.length,
      disponibles: lignes.length,
      duree_s: {
        med: q(
          res.map((r) => r.duree),
          0.5,
        ),
        p90: q(
          res.map((r) => r.duree),
          0.9,
        ),
      },
      calcul_s: {
        med: q(
          res.map((r) => r.calcul),
          0.5,
        ),
        p90: q(
          res.map((r) => r.calcul),
          0.9,
        ),
      },
      aller_retour_ms: {
        med: Math.round(
          q(
            res.map((r) => r.ms),
            0.5,
          ),
        ),
        p90: Math.round(
          q(
            res.map((r) => r.ms),
            0.9,
          ),
        ),
      },
      mots_reconnus: `${tot('justes')}/${tot('att')}`,
      repliques_entieres: res.filter((r) => r.justes === r.att).length,
    },
    null,
    1,
  ),
);
