// « Retrouve ce verset » : TEMPS DE RÉPONSE et justesse de bout en bout contre le SERVICE RÉEL (conteneur jetable de
// l'image ecoute-ia, code de la branche) : envoi de l'extrait (Opus/WebM, comme le navigateur) au mode « retrouver »,
// deux lectures, puis recherche dans tout le texte avec le code de l'API (@awform/hifz). Temps mesuré côté serveur
// (décodage + deux lectures + recherche), sans le réseau du téléphone.
//   node retrouver-mesure.mjs <url du service> <tanzil.tsv> <dossier des extraits>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  chercherDouble,
  decisionRetrouver,
  IndexCoran,
  squelettePhrase,
} from '../../../packages/hifz/dist/index.js';

const [URL_, TSV, DIR] = process.argv.slice(2);
const vs = [];
for (const l of readFileSync(TSV, 'utf8').split('\n')) {
  const x = l.replace(/\r$/, '').replace(/\uFEFF/g, '');
  const t = x.indexOf('\t');
  if (t < 0) continue;
  const [s, a] = x.slice(0, t).trim().split(':').map(Number);
  vs.push({ s, a, text: x.slice(t + 1) });
}
const sq = new Map(vs.map((v) => [`${v.s}:${v.a}`, squelettePhrase(v.text)]));
const idx = new IndexCoran(vs);
const V = JSON.parse(readFileSync(join(DIR, 'verite.json'), 'utf8'));
// lectures brutes gardées (mots seulement) : HORS_LIGNE=1 rejoue la recherche sans le service
const BRUT = join(DIR, 'lectures.json');
const brut =
  process.env.HORS_LIGNE && existsSync(BRUT) ? JSON.parse(readFileSync(BRUT, 'utf8')) : {};
const envoyer = async (f) => {
  if (process.env.HORS_LIGNE) return brut[f];
  const r = await fetch(`${URL_}/ecouter?mode=retrouver`, {
    method: 'POST',
    headers: { 'content-type': 'audio/webm' },
    body: readFileSync(join(DIR, f)),
  });
  return (brut[f] = await r.json());
};
for (const v of V.slice(0, 2)) await envoyer(v.fichier); // mise en route (exclue)
const L = [];
for (const v of V) {
  const t0 = performance.now();
  const j = await envoyer(v.fichier);
  const t1 = performance.now();
  const d =
    j.voix_s < 3
      ? { statut: 'trop_court', resultats: [], egaux: [] }
      : decisionRetrouver(
          chercherDouble(
            idx,
            [j.mots, j.mots_ctc, j.relecture?.mots, j.relecture?.mots_ctc]
              .filter((l) => l?.length)
              .map((l) => l.map((m) => m.w)),
          ),
        );
  const t2 = performance.now();
  const principal = v.versets.reduce((p, x) => (x[1] > p[1] ? x : p))[0];
  const large = new Set([...v.versets.filter((x) => x[1] >= 1.5).map((x) => x[0]), principal]);
  const ok = (k) => large.has(k) || [...large].some((x) => sq.get(x) === sq.get(k));
  const montres = d.egaux.length ? d.egaux : d.resultats.slice(0, 1).map((x) => x.verset);
  L.push({
    f: v.fichier,
    recitant: v.recitant,
    duree: v.duree,
    total_s: (t2 - t0) / 1000,
    service_s: (t1 - t0) / 1000,
    recherche_ms: t2 - t1,
    r1: !!d.resultats[0] && ok(d.resultats[0].verset),
    montre: [...montres, ...d.resultats.slice(1).map((x) => x.verset)].some(ok),
    faux: d.statut === 'trouve' && !montres.some(ok),
    silence: d.statut !== 'trouve',
    relu: !!j.relecture,
  });
  if (process.env.DIAG && !L.at(-1).montre)
    console.error(
      v.fichier,
      v.recitant,
      v.versets,
      '->',
      JSON.stringify(d),
      j.mots.map((m) => m.w).join(' '),
    );
}
if (!process.env.HORS_LIGNE) writeFileSync(BRUT, JSON.stringify(brut));
const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)];
const r3 = (x) => Math.round(x * 1000) / 1000;
const pc = (k, l = L) => Math.round((1000 * l.filter((x) => x[k]).length) / l.length) / 10;
const parRecitant = {};
for (const r of new Set(L.map((x) => x.recitant))) {
  const l = L.filter((x) => x.recitant === r);
  parRecitant[r] = { n: l.length, rang1: pc('r1', l), bon_verset_montre: pc('montre', l) };
}
console.log(
  JSON.stringify(
    {
      extraits: L.length,
      duree_moyenne_s: r3(L.reduce((s, x) => s + x.duree, 0) / L.length),
      temps_total_s: {
        mediane: r3(
          q(
            L.map((x) => x.total_s),
            0.5,
          ),
        ),
        p90: r3(
          q(
            L.map((x) => x.total_s),
            0.9,
          ),
        ),
        max: r3(
          q(
            L.map((x) => x.total_s),
            1,
          ),
        ),
      },
      service_s: {
        mediane: r3(
          q(
            L.map((x) => x.service_s),
            0.5,
          ),
        ),
        p90: r3(
          q(
            L.map((x) => x.service_s),
            0.9,
          ),
        ),
      },
      recherche_ms: {
        mediane: r3(
          q(
            L.map((x) => x.recherche_ms),
            0.5,
          ),
        ),
        p90: r3(
          q(
            L.map((x) => x.recherche_ms),
            0.9,
          ),
        ),
      },
      sous_1_5_s: pc(
        'rapide',
        L.map((x) => ({ rapide: x.total_s < 1.5 })),
      ),
      rang1: pc('r1'),
      bon_verset_montre: pc('montre'),
      reponses_fausses: L.filter((x) => x.faux).length,
      silences: L.filter((x) => x.silence).length,
      relectures: L.filter((x) => x.relu).length,
      par_recitant: parRecitant,
    },
    null,
    1,
  ),
);
