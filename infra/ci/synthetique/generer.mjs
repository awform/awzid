#!/usr/bin/env node
/**
 * Contenu SYNTHÉTIQUE pour les tests (CI sans les livres) — lot 18 bis, audit INF-2.
 * Écrit `infra/ci/contenu-synthetique/` au format des livres (AW.book, AW.lesson, index-lecons.js), lu par le
 * vrai importeur. Deux niveaux (en1, ad1), leçons, un bilan et un examen chacun, les 8 types d'exercices
 * « langue » avec leurs corrigés, un exercice ouvert, un guide de l'enseignant et une translittération (pour
 * vérifier qu'ils sont retirés des projections élève).
 * AUCUN texte religieux ni coranique : seulement des lettres et des mots courants (porte, maison, stylo…).
 * Le Coran de référence (Tanzil) est celui de `infra/ci/contenu/coran` (lien symbolique, jamais copié).
 * Relancer :  node infra/ci/synthetique/generer.mjs   (sortie identique à chaque fois)
 */
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'contenu-synthetique');
const J = (v) => JSON.stringify(v, null, 1);
const write = (rel, text) => {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
};

const MOTS = [
  { ar: 'بَابٌ', tr: 'bābun', fr: 'une porte' },
  { ar: 'بَيْتٌ', tr: 'baytun', fr: 'une maison' },
  { ar: 'قَلَمٌ', tr: 'qalamun', fr: 'un stylo' },
  { ar: 'تُفَّاحَةٌ', tr: 'tuffāḥatun', fr: 'une pomme' },
];

/** les 8 types « langue » (corrigés cohérents) + un exercice ouvert */
function exercices(u) {
  return [
    {
      type: 'premiere_lettre',
      consigne_fr: 'Trouve la première lettre.',
      items: [
        { suite: 'ـَابٌ', reponse: 'ب', options: ['ب', 'ت', 'ث'], mot: 'بَابٌ' },
        { suite: 'ـُفَّاحَةٌ', reponse: 'ت', options: ['ب', 'ت', 'ث'], mot: 'تُفَّاحَةٌ' },
      ],
    },
    {
      type: 'chasse',
      consigne_fr: 'Touche la lettre.',
      cible: 'ب',
      grille: ['ب', 'ت', 'ب', 'ث', 'ا', 'ب'],
    },
    { type: 'relier', items: MOTS.slice(0, 3).map((m) => ({ ar: m.ar, fr: m.fr })) },
    {
      type: 'ecoute',
      items: [
        { dit: 'بَابٌ', options: ['بَابٌ', 'بَيْتٌ'] },
        { dit: 'قَلَمٌ', options: ['بَيْتٌ', 'قَلَمٌ'] },
      ],
    },
    {
      type: 'vrai_faux',
      items: [
        { ar: 'بَابٌ', fr: 'une porte', vrai: true },
        { ar: 'قَلَمٌ', fr: 'une maison', vrai: false, correction_ar: 'قَلَمٌ' },
      ],
    },
    {
      type: 'complete',
      items: [
        {
          avant: 'هٰذَا',
          apres: '',
          options: ['بَابٌ', 'بَيْتٌ'],
          reponse: 'بَابٌ',
          fr: 'Ceci est une porte.',
        },
      ],
    },
    {
      type: 'contient',
      cible: 'ب',
      mots: [
        { ar: 'بَابٌ', oui: true },
        { ar: 'قَلَمٌ', oui: false },
        { ar: 'بَيْتٌ', oui: true },
      ],
    },
    {
      type: 'ordre',
      items: [{ mots: ['بَابٌ', 'هٰذَا'], phrase: 'هٰذَا بَابٌ', fr: 'Ceci est une porte.' }],
    },
    {
      type: 'question',
      consigne_fr: `Réponds (unité ${u}).`,
      items: [{ q_fr: 'Que vois-tu sur l’image ?' }],
    },
  ];
}

function unit(level, n, type, numLecon) {
  const base = {
    n,
    type,
    ...(type === 'lecon' ? { num_lecon: numLecon } : {}),
    titre_ar: type === 'lecon' ? 'الدَّرْسُ' : type === 'bilan' ? 'التَّقْوِيمُ' : 'الِاخْتِبَارُ',
    titre_fr: `${type === 'lecon' ? `Leçon ${numLecon}` : type === 'bilan' ? 'Bilan' : 'Examen'} (synthétique ${level})`,
    lettres: [
      { l: 'ب', nom_ar: 'بَاءٌ', nom_fr: 'ba' },
      { l: 'ت', nom_ar: 'تَاءٌ', nom_fr: 'ta' },
    ],
    objectifs: [{ ar: 'أَقْرَأُ الْكَلِمَاتِ', fr: 'Je lis les mots.' }],
    mots: MOTS,
    lecture: {
      ligne: ['بَ', 'بِ', 'بُ'],
      phrases: [{ ar: 'هٰذَا بَيْتٌ', fr: 'Ceci est une maison.' }],
    },
    exercices: exercices(`${level}.l${String(n).padStart(2, '0')}`),
    parents_fr: 'Mot aux parents (synthétique).',
    guide: { deroule_fr: 'Guide de l’enseignant (synthétique) : jamais montré à l’élève.' },
  };
  // grille des parties « enseignant » des épreuves (format tolérant lu par bookGrid, décision D6)
  if (type !== 'lecon')
    base.guide.bareme = [
      { partie: 'Lecture à voix haute', points: 4 },
      { partie: 'Dictée', points: 4 },
    ];
  if (type !== 'lecon')
    base.lecture = {
      ligne: ['بَ', 'تَ'],
      non_prepare: true,
      vedette: { ar: 'بَابُ الْبَيْتِ', fr: 'la porte de la maison' },
    };
  return base;
}

const LEVELS = {
  en1: {
    titre: 'Enfants — niveau 1 (synthétique)',
    units: ['lecon', 'lecon', 'bilan', 'lecon', 'examen'],
  },
  ad1: { titre: 'Adultes — niveau 1 (synthétique)', units: ['lecon', 'bilan', 'examen'] },
};

rmSync(OUT, { recursive: true, force: true });
const index = {};
for (const [code, L] of Object.entries(LEVELS)) {
  write(
    `data/${code}/book.js`,
    `AW.book(${J({ code, titre_ar: 'كِتَابُ التَّجْرِبَةِ', titre_fr: L.titre, niveau_fr: 'synthétique' })});\n`,
  );
  let lecon = 0;
  let bilan = 0;
  L.units.forEach((type, i) => {
    const n = i + 1;
    if (type === 'lecon') lecon++;
    if (type === 'bilan') bilan++;
    const id = `${code}.l${String(n).padStart(2, '0')}`;
    write(
      `data/${code}/l${String(n).padStart(2, '0')}.js`,
      `AW.lesson(${J(unit(code, n, type, lecon))});\n`,
    );
    index[id] = {
      t: type,
      n: type === 'lecon' ? lecon : type === 'bilan' ? bilan : 1,
      f: `unité ${n}`,
    };
  });
}
// carnets de hifẓ : STRUCTURE seulement (numéros de sourates et de versets, semaines) — aucun texte ; le
// texte affiché vient de Tanzil. Parts courtes et une part « 2:255 » (vérifiée par les tests).
const entry = (sourate, versets, weeks) => ({
  sourate,
  versets,
  portions: weeks.map(([s, v, t]) => ({ s, v, ...(t ? { t } : {}) })),
});
const CARNETS = {
  en1: [
    entry(114, '1-6', [
      [1, '1-3'],
      [2, '4-6'],
      [3, '1-6', 'r'],
    ]),
    entry(113, '1-5', [[4, '1-5']]),
    entry(112, '1-4', [[5, '1-4']]),
  ],
  ad1: [
    entry(112, '1-4', [[1, '1-4']]),
    entry(2, '255', [
      [2, '255'],
      [3, '255', 'r'],
    ]),
  ],
};
for (const [code, socle] of Object.entries(CARNETS))
  write(
    `data/hifz/${code}.js`,
    `AW.hifz(${J({ code, filiere: code.startsWith('en') ? 'enfants' : 'adultes', niveau_fr: 'synthétique', semaines: 30, manzil_parts: 3, parcours: { socle } })});\n`,
  );
write('data/index-lecons.js', `AW.index = ${J(index)};\n`);
write(
  'SYNTHETIQUE.md',
  '# Contenu synthétique\n\nGénéré par `infra/ci/synthetique/generer.mjs` pour les tests sans les livres. Aucun texte religieux ni coranique. Ne pas modifier à la main.\n',
);
symlinkSync(join('..', 'contenu', 'coran'), join(OUT, 'coran'));
console.log(`contenu synthétique écrit : ${OUT}`);
