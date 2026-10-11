// A5 — diagnostic des erreurs simulées NON détectées : ce que la machine a entendu autour, et pourquoi on s'est tu.
//   node diag.mjs <travail> <tsv> <modele> <cond> [type] [n]
import { readFileSync } from 'node:fs';
import { cleMot, comparer, motsAttendus } from '../../../packages/hifz/dist/index.js';

const [W, TSV, modele, cond, type = '', n = '8'] = process.argv.slice(2);
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
const cas = new Map(JSON.parse(readFileSync(`${W}/cas.json`, 'utf8')).map((c) => [c.id, c]));
let k = 0;
for (const h of JSON.parse(readFileSync(`${W}/hyp-${modele}.json`, 'utf8'))) {
  if (h.cond !== cond) continue;
  const c = cas.get(h.id);
  const fausses = type === 'FAUSSES';
  if (!fausses && (!c.verite.length || (type && c.type !== type))) continue;
  const att = motsAttendus(
    c.versets.map(([s, a]) => ({ s, a, text: T.get(`${s}:${a}`) })),
    T.get('1:1'),
  );
  const r = comparer(att, h.mots, { voix: h.voix });
  const v = c.verite[0] ?? { i: -9, fin: -9 };
  const loin = r.ecarts.filter((e) => !(e.fin >= v.i - 1 && e.i <= v.fin + 1));
  if (fausses) {
    if (!loin.length) continue;
    Object.assign(v, { i: loin[0].i, fin: loin[0].fin });
    console.log('FAUSSE ALERTE', JSON.stringify(loin));
  } else if (r.ecarts.some((e) => e.fin >= v.i - 1 && e.i <= v.fin + 1)) continue;
  if (++k > Number(n)) break;
  const lo = Math.max(0, v.i - 3);
  const hi = Math.min(att.length, v.fin + 4);
  console.log(
    `\n${h.id} ${c.type} i=${v.i}-${v.fin} statut=${r.statut} doutes=${r.doutes} couv=${r.couverture}`,
  );
  console.log(
    '  attendu :',
    att
      .slice(lo, hi)
      .map((m) => `${m.i}:${m.cle}${m.i >= v.i && m.i <= v.fin ? '*' : ''}[${r.mots[m.i]}]`)
      .join(' '),
  );
  console.log(
    '  entendu :',
    h.mots.map((m) => `${cleMot(m.w)}(${m.conf},${m.t0}-${m.t1})`).join(' '),
  );
}
