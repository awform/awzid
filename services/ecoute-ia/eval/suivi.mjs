// SUIVI DE LA RÉCITATION (shazam_coran) : analyse de suivi_sim.py avec le code de l'appli (@awform/hifz).
// Pour chaque méthode, à CHAQUE morceau d'une seconde, on compare ce qui est entendu au texte (enCours) et on note ce
// qui serait MONTRÉ à l'élève pendant la récitation :
//   - fausses alertes : tout écart montré qui ne correspond pas à l'erreur simulée (une seule fois par mot) ;
//   - erreurs vues : un écart montré sur le mot visé (± 1 mot), ou dans le verset sauté ; délai depuis l'erreur.
// Méthodes : « direct » (A5 : passages transcrits seuls), « suivi » (passages relus avec leur contexte) ; chacune
// avec une lecture (RNN-T) ou deux lectures d'accord (RNN-T et CTC : l'écart n'est montré que si les deux le voient).
//   node suivi.mjs <tanzil.tsv> <suivi-sim.json>      (DIAG=1 : détail des fausses alertes)
import { readFileSync } from 'node:fs';
import { comparer, motsAttendus, ecartsDAccord } from '../../../packages/hifz/dist/index.js';

const [TSV, SIM] = process.argv.slice(2);
const T = new Map();
for (const l of readFileSync(TSV, 'utf8').split('\n')) {
  const x = l.replace(/\r$/, '').replace(/\uFEFF/g, '');
  const t = x.indexOf('\t');
  if (t > 0) T.set(x.slice(0, t).trim(), x.slice(t + 1));
}
const S = JSON.parse(readFileSync(SIM, 'utf8'));
const q = (a, p) =>
  a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)] : null;
const r2 = (x) => (x === null ? null : Math.round(x * 100) / 100);

// « direct » (A5) seulement si la simulation l'a rejoué ; AVEC_CALCUL=1 : le délai compte le temps de calcul du service
const METHODES = S[0]?.direct
  ? [
      { nom: 'direct (A5), une lecture', src: 'direct', accord: false },
      { nom: 'direct (A5), deux lectures d’accord', src: 'direct', accord: true },
    ]
  : [];
const CALCUL = process.env.AVEC_CALCUL === '1';
for (const k of Object.keys(S[0] ?? {}).filter((x) => x.startsWith('suivi')))
  METHODES.push(
    { nom: `${k} avec contexte, une lecture`, src: k, accord: false },
    { nom: `${k} avec contexte, deux lectures d’accord`, src: k, accord: true },
  );

const resultat = {};
for (const M of METHODES) {
  let fausses = 0;
  let fausJustes = 0;
  let seancesFausses = 0;
  let justes = 0;
  const parType = {};
  const delais = [];
  const calculs = [];
  for (const se of S) {
    const att = motsAttendus(
      se.versets.map(([s, a]) => ({ s, a, text: T.get(`${s}:${a}`) })),
      T.get('1:1'),
    );
    const R = [];
    const C = [];
    const voix = [];
    const vues = new Set();
    let vu = null;
    const v = se.verite;
    for (const m of se[M.src]) {
      calculs.push(m.calcul);
      if (M.src === 'direct') {
        R.push(...m.mots);
        C.push(...m.mots_ctc);
      } else {
        R.push(...m.stables);
        C.push(...m.stables_ctc);
      }
      voix.push(...m.voix);
      const er = comparer(att, R, { voix, enCours: true }).ecarts;
      const montres = M.accord
        ? ecartsDAccord(er, comparer(att, C, { voix, enCours: true }).ecarts)
        : er;
      for (const e of montres) {
        const juste = v && e.fin >= v.i - 1 && e.i <= v.fin + 1;
        if (juste) {
          if (vu === null) vu = m.t + (CALCUL ? m.calcul : 0);
          continue;
        }
        const k = `${e.type}:${e.i}`;
        if (vues.has(k)) continue;
        vues.add(k);
        if (process.env.DIAG && M.accord)
          console.error(
            `[${M.src}] ${se.rid} ${se.versets[0].join(':')} t=${m.t} ${e.type} i=${e.i}-${e.fin} attendu « ${att
              .slice(Math.max(0, e.i - 2), e.fin + 3)
              .map((x) => x.cle)
              .join(' ')} » entendu « ${R.filter((w) => w.t0 > m.t - 14)
              .map((w) => w.w)
              .join(' ')} »`,
          );
      }
    }
    fausses += vues.size;
    if (!v) {
      justes++;
      fausJustes += vues.size;
      if (vues.size) seancesFausses++;
    } else {
      const p = (parType[v.type] ??= { n: 0, vues: 0 });
      p.n++;
      if (vu !== null) {
        p.vues++;
        delais.push(vu - v.t);
      }
    }
  }
  const erreurs = Object.values(parType).reduce((s, p) => s + p.n, 0);
  const vuesTot = Object.values(parType).reduce((s, p) => s + p.vues, 0);
  resultat[M.nom] = {
    seances_justes: justes,
    fausses_alertes_seances_justes: fausJustes,
    seances_justes_avec_fausse_alerte: seancesFausses,
    fausses_alertes_toutes_seances: fausses,
    erreurs_vues: `${vuesTot}/${erreurs}`,
    par_type: Object.fromEntries(Object.entries(parType).map(([k, p]) => [k, `${p.vues}/${p.n}`])),
    delai_s: { mediane: r2(q(delais, 0.5)), p90: r2(q(delais, 0.9)) },
    calcul_morceau_s: { mediane: q(calculs, 0.5), p90: q(calculs, 0.9), max: q(calculs, 1) },
  };
}
console.log(
  JSON.stringify(
    { seances: S.length, minutes: r2(S.reduce((s, x) => s + x.duree, 0) / 60), resultat },
    null,
    1,
  ),
);
