import { readFileSync, writeFileSync } from 'node:fs';
const OUT = (process.env.INVENTAIRE_SORTIE ?? process.env.HOME + '/inventaire-audio-out') + '/';
const { rows, agreges, stats, anomalies } = JSON.parse(readFileSync(OUT + 'rows.json', 'utf8'));
const CORAN = new Set(['a', 'b', 'm']);
const statut = (r) =>
  CORAN.has(r.nature)
    ? 'ayyub'
    : !r.voc
      ? 'non-vocalise'
      : r.cours
        ? 'en-cours'
        : r.ailleurs
          ? 'autre-niveau'
          : 'muet';
const S = {};
for (const s of Object.values(stats)) {
  const o = (S[s.surface] ??= {
    total: 0,
    ok: 0,
    n: { a: 0, b: 0, c: 0, d: 0, e: 0, m: 0 },
    st: { ayyub: 0, 'non-vocalise': 0, 'en-cours': 0, 'autre-niveau': 0, muet: 0 },
  });
  o.total += s.total;
  o.ok += s.ok;
}
for (const r of rows) {
  const o = S[r.surface];
  o.n[r.nature]++;
  o.st[statut(r)]++;
}
const noms = Object.keys(S).sort();
const l = [];
l.push(
  '| Surface | Textes arabes | Avec audio | Sans audio | a | b | c | d | e | mixtes | Ayūb | À générer | Déjà en cours | Fichier ailleurs | Non vocalisé |',
);
l.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const T = {
  total: 0,
  ok: 0,
  sans: 0,
  a: 0,
  b: 0,
  c: 0,
  d: 0,
  e: 0,
  m: 0,
  ay: 0,
  gen: 0,
  cours: 0,
  aut: 0,
  nv: 0,
};
for (const k of noms) {
  const o = S[k];
  const sans = o.total - o.ok;
  l.push(
    `| ${k} | ${o.total} | ${o.ok} | ${sans} | ${o.n.a} | ${o.n.b} | ${o.n.c} | ${o.n.d} | ${o.n.e} | ${o.n.m} | ${o.st.ayyub} | ${o.st.muet} | ${o.st['en-cours']} | ${o.st['autre-niveau']} | ${o.st['non-vocalise']} |`,
  );
  T.total += o.total;
  T.ok += o.ok;
  T.sans += sans;
  for (const n of 'abcdem') T[n === 'm' ? 'm' : n] += o.n[n];
  T.ay += o.st.ayyub;
  T.gen += o.st.muet;
  T.cours += o.st['en-cours'];
  T.aut += o.st['autre-niveau'];
  T.nv += o.st['non-vocalise'];
}
l.push(
  `| **Total** | ${T.total} | ${T.ok} | ${T.sans} | ${T.a} | ${T.b} | ${T.c} | ${T.d} | ${T.e} | ${T.m} | ${T.ay} | ${T.gen} | ${T.cours} | ${T.aut} | ${T.nv} |`,
);
writeFileSync(OUT + 'tableau-surfaces.md', l.join('\n') + '\n');
// leçons par livre
const P = {};
for (const r of rows.filter((x) => x.surface === 'lecons-et-videos')) {
  const o = (P[r.niveau] ??= { n: 0, gen: 0, ay: 0, cours: 0 });
  o.n++;
  const s = statut(r);
  if (s === 'muet') o.gen++;
  else if (s === 'ayyub') o.ay++;
  else if (s === 'en-cours') o.cours++;
}
const lv = [
  '| Livre | Sans audio | À générer (nouveau) | Déjà en cours (v2) | Ayyūb |',
  '|---|---|---|---|---|',
];
const ordre = (x) => {
  const m = /^([a-z]+)(\d+)$/.exec(x);
  return { ad: 0, en: 1, ado: 2 }[m[1]] * 100 + Number(m[2]);
};
for (const k of Object.keys(P).sort((a, b) => ordre(a) - ordre(b)))
  lv.push(`| ${k} | ${P[k].n} | ${P[k].gen} | ${P[k].cours} | ${P[k].ay} |`);
writeFileSync(OUT + 'tableau-livres.md', lv.join('\n') + '\n');
// priorités de l'a-générer
console.log(readFileSync(OUT + 'tableau-surfaces.md', 'utf8'));
console.log(readFileSync(OUT + 'tableau-livres.md', 'utf8'));
// natures totales (sur les textes sans audio)
const nat = {};
for (const r of rows) nat[r.nature] = (nat[r.nature] || 0) + 1;
console.log(nat, 'agreges', agreges.length);
// précision des a
const pr = {};
for (const r of rows.filter((x) => x.nature === 'a')) pr[r.precision] = (pr[r.precision] || 0) + 1;
console.log(pr);
// anomalies par surface
const an = {};
for (const a of anomalies)
  an[a.surface + ' ' + a.nature] = (an[a.surface + ' ' + a.nature] || 0) + 1;
console.log(an);
// déjà dans les tables Ayyūb
