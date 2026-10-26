/* eslint-disable -- outil d'exploitation (inventaire audio global du 26/10/2026), pas du code de l'application */
import { readFileSync, writeFileSync } from 'node:fs';
import * as L from './lib.mjs';
const OUT = (process.env.INVENTAIRE_SORTIE ?? process.env.HOME + '/inventaire-audio-out') + '/';
const DATA = L.HOME + 'awform-demo/packages/content/data/zero-muet/';
const { rows, agreges, stats, anomalies } = JSON.parse(readFileSync(OUT + 'rows.json', 'utf8'));
const net = (s) =>
  String(s ?? '')
    .replace(/[\t\r\n]+/g, ' ')
    .trim();
const MEC = (r) => {
  const s = r.surface;
  if (s === 'vivre-douas') return 'douas (static/douas/audio + champ audio de douas.json)';
  if (s.startsWith('madjaliss'))
    return s === 'madjaliss-phrases'
      ? 'madjaliss (audio/madjaliss/<mutn>/<id>.mp3 + index_madjaliss.json)'
      : 'madjaliss (mots : niveau a creer)';
  if (
    [
      'interface-titres-consignes',
      'coran-noms-sourates',
      'ecriture-tracer-lettres',
      'arabe-racines-pluriels',
      'coran-mots-lemmes',
      'plus-aide-termes-arabes-dans-le-francais',
    ].includes(s)
  )
    return 'lecons-audio (niveau a determiner)';
  if (s === 'coran-lecture-qc')
    return "lecons-audio (niveaux qc1-qc3 a creer ; qc n'a aucun mecanisme audio)";
  if (s === 'vivre-fiches-adab') return 'lecons-audio (niveaux akhlaq, akhlaq-enf : vides)';
  return 'lecons-audio';
};
const cibleDe = (r) => {
  const s = r.surface;
  if (
    [
      'interface-titres-consignes',
      'coran-noms-sourates',
      'ecriture-tracer-lettres',
      'arabe-racines-pluriels',
      'coran-mots-lemmes',
      'plus-aide-termes-arabes-dans-le-francais',
    ].includes(s)
  )
    return 'A-DETERMINER';
  if (s === 'madjaliss-phrases') return 'madjaliss/' + r.niveau;
  if (s === 'madjaliss-vocabulaire') return 'madjaliss-mots/' + r.niveau;
  if (s === 'vivre-douas') return 'douas';
  return r.cible;
};
const CORAN = new Set(['a', 'b', 'm']);
const statut = (r) => {
  if (CORAN.has(r.nature)) return r.nature === 'm' ? 'ayyub+synthese' : 'ayyub';
  if (!r.voc) return 'non-vocalise';
  if (r.cours) return 'deja-en-cours';
  if (r.ailleurs) return 'fichier-existe-autre-niveau';
  return 'muet';
};
const tri = (a, b) =>
  a.surface < b.surface
    ? -1
    : a.surface > b.surface
      ? 1
      : a.niveau < b.niveau
        ? -1
        : a.niveau > b.niveau
          ? 1
          : String(a.id) < String(b.id)
            ? -1
            : String(a.id) > String(b.id)
              ? 1
              : 0;
const toutes = [...rows, ...agreges].sort(tri);

// ---- inventaire
const H1 = [
  'surface',
  'niveau',
  'identifiant',
  'texte',
  'nature',
  'statut',
  'sha1',
  'versets',
  'niveau_audio_cible',
  'mecanisme',
  'note',
];
const inv = [H1.join('\t')];
for (const r of toutes)
  inv.push(
    [
      r.surface,
      r.niveau,
      r.id,
      net(r.texte),
      r.nature,
      r.precision === 'surface-par-reference' ? 'ayyub' : statut(r),
      r.sha,
      r.refs,
      cibleDe(r),
      r.precision === 'surface-par-reference' ? 'ayyub' : MEC(r),
      net((r.precision ? r.precision + ' ; ' : '') + r.note),
    ]
      .map(net)
      .join('\t'),
  );
writeFileSync(OUT + 'inventaire-global-26-10.tsv', inv.join('\n') + '\n');

// ---- à générer (c, d, e + partie « hadith » des mixtes), sans doublon avec les fichiers déjà en cours
const gen = new Map();
const natLib = {
  c: 'hadith-ou-athar',
  d: 'dhikr-ou-doua',
  e: 'arabe-de-lecon',
  m: 'hadith-dans-texte-mixte',
};
const ajoute = (texte, r, nature) => {
  const sha = L.audioFileId(texte);
  if (!sha) return;
  if (L.enCours.has(sha)) return;
  if (L.aFichierAilleurs(texte) && nature !== 'm') return;
  if (!L.vocalise(texte)) return;
  let g = gen.get(sha);
  if (!g) {
    g = {
      sha,
      niveaux: new Set(),
      surfaces: new Set(),
      parties: new Set(),
      nature,
      texte,
      meca: new Set(),
    };
    gen.set(sha, g);
  }
  for (const n of String(cibleDe(r)).split(' ')) g.niveaux.add(n);
  g.surfaces.add(r.surface);
  g.parties.add(String(r.id).split(' ').slice(1).join(' ') || r.id);
  g.meca.add(MEC(r).split(' ')[0]);
};
for (const r of rows) {
  if (r.nature === 'm') {
    for (const seg of (r.partieSynthese || '').split(' | ').filter(Boolean)) ajoute(seg, r, 'm');
    continue;
  }
  if (CORAN.has(r.nature)) continue;
  if (statut(r) !== 'muet') continue;
  ajoute(r.texte, r, r.nature);
}
const H2 = [
  'sha1',
  'priorite_proposee',
  'niveaux',
  'mecanisme',
  'surfaces',
  'parties',
  'nature',
  'texte',
];
const lg = [H2.join('\t')];
const prio = (g) => {
  const s = [...g.surfaces];
  const p = (x) =>
    ['coran-mots-lemmes', 'madjaliss-vocabulaire'].includes(x)
      ? 3
      : [
            'religion-livres-enfants',
            'religion-livres-ados-adultes',
            'lectures-graduees',
            'madjaliss-phrases',
            'coran-lecture-qc',
            'hifz-livrets',
            'gp-valeurs',
          ].includes(x)
        ? 2
        : x === 'lecons-et-videos'
          ? [...g.niveaux].some((n) => /^(en|ado|ad[1-4]$)/.test(n))
            ? 1
            : 2
          : 1;
  return Math.min(...s.map(p));
};
const gl = [...gen.values()].sort(
  (a, b) =>
    prio(a) - prio(b) ||
    ([...a.surfaces].sort()[0] < [...b.surfaces].sort()[0]
      ? -1
      : [...a.surfaces].sort()[0] > [...b.surfaces].sort()[0]
        ? 1
        : a.sha < b.sha
          ? -1
          : 1),
);
for (const g of gl)
  lg.push(
    [
      g.sha,
      'P' + prio(g),
      [...g.niveaux].sort().join(' '),
      [...g.meca].join(' '),
      [...g.surfaces].sort().join(' '),
      [...g.parties].slice(0, 4).join(' ; '),
      natLib[g.nature],
      g.texte,
    ]
      .map(net)
      .join('\t'),
  );
const parPrio = {};
for (const g of gl) {
  const k = 'P' + prio(g);
  parPrio[k] = (parPrio[k] || 0) + 1;
}
console.log('priorites', parPrio);
writeFileSync(OUT + 'a-generer-global-26-10.tsv', lg.join('\n') + '\n');

// ---- à rattacher : fichier de synthèse existant, mais pas au niveau d'audio de la page (aucune génération, étiquette seulement)
const att = new Map();
for (const r of rows) {
  if (CORAN.has(r.nature) || !r.voc || r.cours || !r.ailleurs) continue;
  const sha = L.audioFileId(r.texte);
  const niveauxActuels = [...(L.index.get(sha) ?? [])].sort().join(' ');
  let g = att.get(sha);
  if (!g) {
    g = { sha, niveauxActuels, niveaux: new Set(), surfaces: new Set(), texte: r.texte };
    att.set(sha, g);
  }
  for (const n of String(cibleDe(r)).split(' ')) g.niveaux.add(n);
  g.surfaces.add(r.surface);
}
const ra = [
  ['sha1', 'niveaux_actuels_dans_l_index', 'niveaux_a_ajouter', 'surfaces', 'texte'].join('\t'),
];
for (const g of [...att.values()].sort((a, b) => (a.sha < b.sha ? -1 : 1)))
  ra.push(
    [
      g.sha,
      g.niveauxActuels,
      [...g.niveaux].sort().join(' '),
      [...g.surfaces].sort().join(' '),
      g.texte,
    ]
      .map(net)
      .join('\t'),
  );
writeFileSync(OUT + 'a-rattacher-niveau-26-10.tsv', ra.join('\n') + '\n');
console.log('a-rattacher', ra.length - 1);

// ---- Ayyūb
const deja = new Map();
try {
  const t = JSON.parse(readFileSync(DATA + 'coran-ayyub-table.json', 'utf8'));
  for (const e of t.entrees) deja.set(L.audioKey(e.texte), 'table');
} catch {}
for (const f of ['referent-373.tsv', 'ayyub-complement.tsv'])
  for (const l of readFileSync(DATA + f, 'utf8')
    .split('\n')
    .slice(1)) {
    const [t, , d] = l.split('\t');
    if (t && ['ayyub', 'mixte', 'ambigu'].includes(d))
      deja.set(L.audioKey(t), f.replace('.tsv', ''));
  }
const H3 = [
  'surface',
  'niveau',
  'identifiant',
  'nature',
  'texte',
  'versets',
  'precision',
  'partie_coran',
  'partie_synthese',
  'sha1',
  'deja_classe',
  'note',
];
const ay = [H3.join('\t')];
for (const r of toutes.filter((x) => CORAN.has(x.nature)))
  ay.push(
    [
      r.surface,
      r.niveau,
      r.id,
      r.nature,
      r.texte,
      r.refs,
      r.precision,
      r.partieCoran,
      r.partieSynthese,
      r.sha,
      deja.get(L.audioKey(r.texte)) ?? '',
      r.note,
    ]
      .map(net)
      .join('\t'),
  );
writeFileSync(OUT + 'ayyub-global-26-10.tsv', ay.join('\n') + '\n');

// ---- anomalies (fichier de synthèse sur un texte Coran)
const an = [['surface', 'niveau', 'identifiant', 'nature', 'sha1', 'texte'].join('\t')];
const vu = new Set();
for (const a of anomalies) {
  const k = a.sha + a.niveau;
  if (vu.has(k)) continue;
  vu.add(k);
  an.push([a.surface, a.niveau, a.id, a.nature, a.sha, a.texte].map(net).join('\t'));
}
writeFileSync(OUT + 'anomalies-synthese-sur-coran-26-10.tsv', an.join('\n') + '\n');

// ---- chiffres
const cnt = {};
for (const r of toutes) {
  const s = r.surface;
  const st = r.precision === 'surface-par-reference' ? 'ayyub' : statut(r);
  cnt[s] ??= {};
  const k = `${r.nature}/${st}`;
  cnt[s][k] = (cnt[s][k] || 0) + 1;
}
const tot = {};
for (const s of Object.values(stats)) {
  tot[s.surface] ??= [0, 0];
  tot[s.surface][0] += s.total;
  tot[s.surface][1] += s.ok;
}
writeFileSync(
  OUT + 'chiffres.json',
  JSON.stringify(
    { cnt, tot, nGen: gen.size, nAy: ay.length - 1, nInv: inv.length - 1, nAn: an.length - 1 },
    null,
    1,
  ),
);
console.log(
  'inventaire',
  inv.length - 1,
  'a-generer',
  lg.length - 1,
  'ayyub',
  ay.length - 1,
  'anomalies',
  an.length - 1,
);
const natTot = {};
for (const r of toutes) natTot[r.nature] = (natTot[r.nature] || 0) + 1;
console.log(natTot);
