// A5 — analyse du suivi en direct simulé (direct_sim.py) avec le code de l'appli (`comparer`, enCours) :
// fausses alertes montrées PENDANT la récitation (récitations justes), verset sauté vu en direct, temps de calcul
// par morceau d'une seconde, retard entre la fin d'un mot et son arrivée en « mot sûr ».
//   node direct.mjs <travail> <tsv> <modele>
import { readFileSync } from 'node:fs';
import { comparer, motsAttendus } from '../../../packages/hifz/dist/index.js';

const [W, TSV, modele] = process.argv.slice(2);
const T = new Map();
for (const l of readFileSync(TSV, 'utf8').split('\n')) {
  const x = l.replace(/\r$/, '');
  const t = x.indexOf('\t');
  if (t > 0)
    T.set(
      x
        .slice(0, t)
        .replace(/^\uFEFF/, '')
        .trim(),
      x.slice(t + 1).replace(/^\uFEFF/, ''),
    );
}
const S = JSON.parse(readFileSync(`${W}/direct-${modele}.json`, 'utf8'));
const calculs = [];
const retards = [];
let fausses = 0;
let seancesFausses = 0;
let sautsVus = 0;
let sauts = 0;
let comparaisons = 0;
let msComparer = 0;
for (const se of S) {
  const att = motsAttendus(
    se.versets.map(([s, a]) => ({ s, a, text: T.get(`${s}:${a}`) })),
    T.get('1:1'),
  );
  const surs = [];
  const voix = [];
  const vues = new Set();
  let sautVu = false;
  for (const m of se.morceaux) {
    calculs.push(m.calcul);
    for (const w of m.mots) retards.push(m.t - w.t1);
    surs.push(...m.mots);
    voix.push(...m.voix);
    const t0 = performance.now();
    const r = comparer(att, surs, { voix, enCours: !m.fin });
    msComparer += performance.now() - t0;
    comparaisons++;
    for (const e of r.ecarts) {
      const vrai = se.saut && e.s === se.saut[0] && e.a === se.saut[1];
      if (vrai) sautVu = true;
      else {
        const k = `${e.type}:${e.i}`;
        if (process.env.DIAG && !vues.has(k))
          console.error(
            `t=${m.t} ${e.type} i=${e.i}-${e.fin} (${att[e.i]?.cle}) conf=${e.confiance} | entendu autour :`,
            surs
              .map((w) => `${w.w}@${w.t0}`)
              .slice(-12)
              .join(' '),
            '| attendu :',
            att
              .slice(Math.max(0, e.i - 3), e.fin + 3)
              .map((x) => x.cle)
              .join(' '),
          );
        vues.add(k);
      }
    }
  }
  if (se.saut) {
    sauts++;
    if (sautVu) sautsVus++;
  }
  fausses += vues.size;
  if (vues.size) seancesFausses++;
}
const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)];
console.log(
  JSON.stringify(
    {
      modele,
      seances: S.length,
      morceaux: calculs.length,
      calcul_morceau_s: { mediane: q(calculs, 0.5), p90: q(calculs, 0.9), max: q(calculs, 1) },
      retard_mot_sur_s: { mediane: +q(retards, 0.5).toFixed(2), p90: +q(retards, 0.9).toFixed(2) },
      fausses_alertes_en_direct: fausses,
      seances_avec_fausse_alerte: seancesFausses,
      versets_sautes_vus: `${sautsVus}/${sauts}`,
      comparer_ms_moyen: +(msComparer / comparaisons).toFixed(1),
    },
    null,
    1,
  ),
);
