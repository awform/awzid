// « Retrouve ce verset » : contrôle du PORTAGE TypeScript (@awform/hifz, retrouver.ts) contre le prototype Python de
// l'étude (recherche_coran_ia/prototypes/retrouve_verset.py). On rejoue la recherche sur les mots ENTENDUS gardés
// dans les résultats de l'étude (50 extraits × 2 conditions × 2 lectures) et on compare les 3 premiers passages,
// leurs scores et les ex æquo ; puis on recalcule les chiffres de l'étude (rang 1, rang 3, ex æquo) avec le code de
// l'appli, et le temps de recherche.
//   node retrouver-portage.mjs <tanzil.tsv> <shazam-resultats.json>
import { readFileSync } from 'node:fs';
import {
  chercherDouble,
  decisionRetrouver,
  IndexCoran,
  squelettePhrase,
} from '../../../packages/hifz/dist/index.js';

const [TSV, RES] = process.argv.slice(2);
const versets = [];
for (const l of readFileSync(TSV, 'utf8').split('\n')) {
  const x = l.replace(/\r$/, '').replace(/\uFEFF/g, '');
  const t = x.indexOf('\t');
  if (t < 0) continue;
  const [s, a] = x.slice(0, t).trim().split(':').map(Number);
  versets.push({ s, a, text: x.slice(t + 1) });
}
let t0 = performance.now();
const idx = new IndexCoran(versets);
const tIndex = performance.now() - t0;
const R = JSON.parse(readFileSync(RES, 'utf8'));
// « même texte » : mêmes squelettes (comme le juge du prototype)
const texteDe = new Map(versets.map((v) => [`${v.s}:${v.a}`, squelettePhrase(v.text)]));
const cas = new Map();
for (const c of R.cas) cas.set(`${c.id}/${c.cond}/${c.tete}`, c);
let identiques = 0;
let ecarts = 0;
const diffs = [];
const tRech = [];
const stats = {};
for (const c of R.cas) {
  if (c.tete === 'fusion') continue;
  const mots = c.entendu ? c.entendu.split(' ') : [];
  t0 = performance.now();
  const r = idx.chercher(mots);
  tRech.push(performance.now() - t0);
  const a = JSON.stringify(r.resultats.map((x) => [x.verset, x.passage, x.score]));
  const b = JSON.stringify(c.top3.map((x) => [x.verset, x.passage, x.score]));
  const eg = JSON.stringify(r.egaux) === JSON.stringify([...new Set(c.egaux)]);
  if (a === b && eg) identiques++;
  else {
    ecarts++;
    if (diffs.length < 8)
      diffs.push({ id: c.id, cond: c.cond, tete: c.tete, ts: a, py: b, egaux: [r.egaux, c.egaux] });
  }
}
// chiffres de l'étude recalculés avec le code de l'appli (lecture double : on garde la plus sûre)
const juge = (c, r) => {
  const pres = c.verite.map((v) => {
    const m = /^(\d+:\d+) \(([\d.]+)s\)$/.exec(v);
    return [m[1], Number(m[2])];
  });
  const principal = pres.reduce((p, x) => (x[1] > p[1] ? x : p))[0];
  const large = new Set([...pres.filter((p) => p[1] >= 1.5).map((p) => p[0]), principal]);
  const txt = new Set([...large].map((v) => texteDe.get(v)));
  // « équivalent » : un verset au même texte compte aussi comme juste
  const ok = (v) => large.has(v) || txt.has(texteDe.get(v));
  const rs = r.resultats;
  // ce que l'écran MONTRE (decisionRetrouver) : le passage ou les ex æquo, puis les autres presque identiques
  const d = decisionRetrouver(r);
  const montres = [
    ...new Set([
      ...(d.egaux.length ? d.egaux : d.resultats.slice(0, 1).map((x) => x.verset)),
      ...d.resultats.slice(1).map((x) => x.verset),
    ]),
  ];
  return {
    r1: !!rs[0] && ok(rs[0].verset),
    r3: rs.slice(0, 3).some((x) => ok(x.verset)),
    egaux: !!rs[0] && (ok(rs[0].verset) || r.egaux.some((v) => large.has(v))),
    faux06:
      !!rs[0] && rs[0].score >= 0.6 && !ok(rs[0].verset) && !r.egaux.some((v) => large.has(v)),
    montre_juste: montres.some((v) => ok(v) || large.has(v)),
    montres: montres.length,
    montres_faux: montres.filter((v) => !ok(v)).length,
    silence: d.statut !== 'trouve',
  };
};
for (const cond of ['propre', 'telephone']) {
  const L = [];
  for (let id = 0; id < 50; id++) {
    const a = cas.get(`${id}/${cond}/rnnt`);
    const b = cas.get(`${id}/${cond}/ctc`);
    if (!a || !b) continue;
    const r = chercherDouble(idx, [a.entendu.split(' '), b.entendu.split(' ')]);
    L.push(juge(a, r));
  }
  const pc = (k) => Math.round((1000 * L.filter((x) => x[k]).length) / L.length) / 10;
  stats[cond] = {
    n: L.length,
    rang1: pc('r1'),
    rang3: pc('r3'),
    ex_aequo: pc('egaux'),
    faux_au_dessus_06: L.filter((x) => x.faux06).length,
    // écran : le bon verset est-il parmi ce qui est montré ? combien d'AUTRES versets sont montrés avec lui ? (passages
    // au texte identique ou presque — mutashābihāt, ex. 6:151 / 17:33 / 25:68 : l'extrait se trouve bien là aussi)
    ecran_bon_verset_montre: pc('montre_juste'),
    ecran_silences: L.filter((x) => x.silence).length,
    ecran_versets_montres: L.reduce((s, x) => s + x.montres, 0),
    ecran_autres_versets_proches: L.reduce((s, x) => s + x.montres_faux, 0),
  };
}
const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)];
console.log(
  JSON.stringify(
    {
      index: { lettres: idx.lettres, grammes: idx.grammes, construit_ms: Math.round(tIndex) },
      portage: { identiques, ecarts, exemples: diffs },
      fusion_code_appli: stats,
      recherche_ms: {
        mediane: +q(tRech, 0.5).toFixed(1),
        p90: +q(tRech, 0.9).toFixed(1),
        max: +q(tRech, 1).toFixed(1),
      },
    },
    null,
    1,
  ),
);
