// A5 — mesure de la détection (même comparaison que le service : @awform/hifz `comparer`).
//   node mesurer.mjs <dossier de travail> <tanzil-uthmani.tsv> [seuils JSON]
// Lit cas.json (vérité des erreurs simulées) et hyp-<modele>.json (mots entendus) ; écrit mesures.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { comparer, motsAttendus, SEUILS } from '../../../packages/hifz/dist/index.js';

const [W, TSV, seuils] = process.argv.slice(2);
if (seuils) Object.assign(SEUILS, JSON.parse(seuils));
const T = new Map();
for (const l of readFileSync(TSV, 'utf8').replace(/^﻿/, '').split('\n')) {
  const x = l.replace(/\r$/, '');
  const t = x.indexOf('\t');
  if (t > 0) T.set(x.slice(0, t).trim(), x.slice(t + 1).replace(/^﻿/, ''));
}
const bism = T.get('1:1');
const cas = new Map(JSON.parse(readFileSync(`${W}/cas.json`, 'utf8')).map((c) => [c.id, c]));
const out = {};
for (const modele of ['nemo', 'whisper']) {
  const f = `${W}/hyp-${modele}.json`;
  if (!existsSync(f)) continue;
  const hyps = JSON.parse(readFileSync(f, 'utf8'));
  const par = {};
  for (const h of hyps) {
    const c = cas.get(h.id);
    const att = motsAttendus(
      c.versets.map(([s, a]) => ({ s, a, text: T.get(`${s}:${a}`) })),
      bism,
    );
    const r = comparer(att, h.mots, { voix: h.voix });
    const k = `${h.cond}`;
    const m = (par[k] ??= {
      cas: 0,
      mots: 0,
      duree: 0,
      calcul: 0,
      pasCompris: 0,
      fausses: 0,
      casAvecFausse: 0,
      types: {},
    });
    m.cas++;
    m.mots += att.length;
    m.duree += h.duree;
    m.calcul += h.calcul;
    if (r.statut === 'pas_compris') m.pasCompris++;
    const v = c.verite[0];
    const proche = (e) => v && e.fin >= v.i - 1 && e.i <= v.fin + 1;
    const fausses = r.ecarts.filter((e) => !proche(e));
    m.fausses += fausses.length;
    if (fausses.length) m.casAvecFausse++;
    const ty = (m.types[c.type] ??= { n: 0, detecte: 0, bonType: 0, pasCompris: 0, fausses: 0 });
    ty.n++;
    ty.fausses += fausses.length;
    if (r.statut === 'pas_compris') ty.pasCompris++;
    if (v) {
      const vus = r.ecarts.filter(proche);
      if (vus.length) ty.detecte++;
      if (vus.some((e) => e.type === v.type || (v.type === 'verset_saute' && e.type === 'oublie')))
        ty.bonType++;
    }
  }
  for (const m of Object.values(par)) {
    m.parMinute = +((m.calcul / m.duree) * 60).toFixed(2);
    m.fausseParCent = +((m.fausses / m.mots) * 100).toFixed(2);
    m.duree = +m.duree.toFixed(1);
    m.calcul = +m.calcul.toFixed(1);
  }
  out[modele] = par;
}
writeFileSync(`${W}/mesures.json`, JSON.stringify({ seuils: SEUILS, out }, null, 1));
for (const [mod, par] of Object.entries(out))
  for (const [cond, m] of Object.entries(par)) {
    console.log(
      `\n== ${mod} / ${cond} : ${m.cas} cas, ${m.mots} mots, ${m.duree} s d'audio, calcul ${m.parMinute} s par minute, ` +
        `pas compris ${m.pasCompris}, fausses alertes ${m.fausses} (${m.fausseParCent} pour 100 mots, ${m.casAvecFausse} cas)`,
    );
    for (const [t, x] of Object.entries(m.types))
      console.log(
        `   ${t.padEnd(13)} n=${x.n} détecté=${x.detecte} (${((x.detecte / x.n) * 100).toFixed(0)} %) bon type=${x.bonType} pas compris=${x.pasCompris} fausses=${x.fausses}`,
      );
  }
