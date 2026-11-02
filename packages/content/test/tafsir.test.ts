/**
 * Tafsīr abrégé et mot à mot (2/11/2026) — fichiers `packages/content/tafsir/NNN.json`, construction, filtrage par public.
 *  - les 114 fichiers existent, comptes de `meta.json` recomptés (6 236 versets) ; versets par sourate = Tanzil ;
 *  - l'arabe de chaque verset et de chaque mot est celui de Tanzil OCTET POUR OCTET (TSV du dépôt), sans normalisation ;
 *  - aucun segment réservé (D-TF-445) ni mention interne dans les fichiers ; aucun champ de translittération ;
 *  - la construction REFUSE un texte différent de Tanzil, un mot décalé, un segment adulte sans note de contexte, un marqueur
 *    réservé non marqué ; le filtrage par public (élève, adulte, tout voir) ne laisse aucune trace d'un segment refusé.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ayahCandidates, loadTanzil } from '../src/quran.js';
import {
  construireSourate,
  filtrerSourate,
  lirePlage,
  MARQUEURS_INTERDITS,
  motsDuVerset,
  publicDe,
  sourateJson,
  voit,
  type SourateTafsir,
  type SourceSourate,
} from '../src/tafsir.js';

const chemin = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const DOSSIER = chemin('../tafsir/');
const tanzil = loadTanzil(
  readFileSync(chemin('../madjaliss-source/coran/tanzil-uthmani.tsv'), 'utf8'),
);
const num = (s: number) => String(s).padStart(3, '0');
const fichier = (s: number) => readFileSync(`${DOSSIER}${num(s)}.json`, 'utf8');
const sourate = (s: number) => JSON.parse(fichier(s)) as SourateTafsir;

describe('fichiers du tafsīr (114 sourates)', () => {
  it('114 fichiers de sourate + meta.json, rien d’autre', () => {
    const noms = readdirSync(DOSSIER).sort();
    expect(noms).toHaveLength(115);
    expect(noms.slice(0, 3)).toEqual(['001.json', '002.json', '003.json']);
    expect(noms.at(-1)).toBe('meta.json');
  });

  it('meta.json = comptes recomptés : 6 236 versets, 77 430 mots (77 401 + 29 d’al-Fātiḥa)', () => {
    const meta = JSON.parse(readFileSync(`${DOSSIER}meta.json`, 'utf8')) as Record<string, unknown>;
    let versets = 0;
    let mots = 0;
    let points = 0;
    for (let s = 1; s <= 114; s++) {
      const x = sourate(s);
      versets += x.versets.length;
      points += x.points.length;
      for (const v of x.versets) mots += v.mots.length;
    }
    expect(versets).toBe(6236);
    expect(mots).toBe(77430);
    expect(meta).toMatchObject({ v: 1, sourates: 114, versets, mots, points, points_marques: 0 });
    // la partie hors al-Fātiḥa : 6 229 versets et 77 401 mots (les fichiers du référent)
    expect(versets - sourate(1).versets.length).toBe(6229);
    expect(mots - sourate(1).versets.reduce((a, v) => a + v.mots.length, 0)).toBe(77401);
  });

  it('nombre de versets de chaque sourate = celui de Tanzil', () => {
    const attendus = new Map<number, number>();
    for (const ref of tanzil.keys()) {
      const s = Number(ref.split(':')[0]);
      attendus.set(s, (attendus.get(s) ?? 0) + 1);
    }
    expect(attendus.size).toBe(114);
    for (let s = 1; s <= 114; s++) {
      const x = sourate(s);
      expect(x.s).toBe(s);
      expect(
        x.versets.map((v) => v.a),
        `sourate ${s}`,
      ).toEqual(Array.from({ length: attendus.get(s)! }, (_, i) => i + 1));
    }
  });

  it('l’arabe de chaque verset est celui de Tanzil OCTET POUR OCTET (6 236 versets), sans normalisation', () => {
    let ecarts = 0;
    for (let s = 1; s <= 114; s++)
      for (const v of sourate(s).versets) {
        // égalité stricte de chaînes : texte Tanzil, ou texte Tanzil sans la basmala d'en-tête (verset 1)
        if (!ayahCandidates(tanzil, s, v.a).includes(v.ar)) ecarts++;
      }
    expect(ecarts).toBe(0);
  });

  it('chaque mot arabe du mot à mot est le mot de Tanzil (même suite, mêmes octets) et porte un sens', () => {
    let ecarts = 0;
    let sansSens = 0;
    for (let s = 1; s <= 114; s++)
      for (const v of sourate(s).versets) {
        const attendus = motsDuVerset(v.ar);
        if (attendus.length !== v.mots.length || attendus.some((w, i) => w !== v.mots[i]![0]))
          ecarts++;
        for (const m of v.mots) if (!m[1].trim()) sansSens++;
        expect(v.sens.trim().length).toBeGreaterThan(0);
      }
    expect(ecarts).toBe(0);
    expect(sansSens).toBe(0);
  });

  it('chaque verset référence des points qui existent et le couvrent', () => {
    for (let s = 1; s <= 114; s++) {
      const x = sourate(s);
      const parId = new Map(x.points.map((p) => [p.id, p]));
      expect(parId.size).toBe(x.points.length);
      for (const v of x.versets)
        for (const id of v.p) {
          const p = parId.get(id)!;
          expect(p, `${s}:${v.a}`).toBeTruthy();
          expect(p.plage.some(([de, a]) => v.a >= de && v.a <= a)).toBe(true);
        }
    }
  });

  it('aucun segment réservé (D-TF-445) ni mention interne dans les fichiers ; aucun champ de translittération', () => {
    const interdit = /mention publique interdite/i;
    for (let s = 1; s <= 114; s++) {
      const brut = fichier(s);
      expect(interdit.test(brut), `sourate ${s}`).toBe(false);
      expect(MARQUEURS_INTERDITS.test(brut), `sourate ${s}`).toBe(false);
      expect(brut).not.toMatch(/translit|phon[ée]tique/i);
      for (const p of sourate(s).points) expect(p.acces).toBeUndefined();
    }
  });

  it('chaque fichier est exactement ce que produit le format (relu puis réécrit = mêmes octets)', () => {
    for (let s = 1; s <= 114; s++)
      expect(sourateJson(sourate(s)) === fichier(s), `${s}`).toBe(true);
  });
});

// ---------------------------------------------------------------- construction
const fakeSource = (): SourceSourate => ({
  numero: 112,
  nom_ar: 'x',
  nom_fr: 'Sourate de test',
  nombre_versets: 2,
  sens_general: 'Résumé fictif de test.',
  versets: [],
  tafsir: [
    {
      point: 'Point fictif (v. 1-2)',
      explication: 'Explication fictive.',
      sources: ['Source fictive'],
    },
  ],
});

/** Source minimale cohérente : versets 112:1-2 (basmala d'en-tête retirée du premier), mot à mot par mot de Tanzil. */
function sourceValide(): SourceSourate {
  const src = fakeSource();
  src.versets = [1, 2].map((a) => {
    const texte = ayahCandidates(tanzil, 112, a).at(-1)!;
    return {
      ref: `112:${a}`,
      ar: texte,
      mot_a_mot: motsDuVerset(texte).map((w, i) => ({ ar: w, fr: `sens ${a}.${i + 1}` })),
      sens: `Sens fictif ${a}`,
    };
  });
  return src;
}

describe('construction (refus au moindre écart)', () => {
  it('une source cohérente est acceptée ; le fichier produit est stable (JSON relu = objet)', () => {
    const r = construireSourate(sourceValide(), tanzil);
    expect(r.erreurs).toEqual([]);
    expect(JSON.parse(sourateJson(r.sourate))).toEqual(r.sourate);
    expect(r.sourate.versets[0]!.p).toEqual([0]);
    expect(r.sourate.versets[1]!.p).toEqual([0]);
  });

  it('refuse un texte de verset qui diffère d’UN octet de Tanzil', () => {
    const s = sourceValide();
    s.versets[1]!.ar = s.versets[1]!.ar.replace('ّ', '');
    // un verset sans chadda dans le texte ne peut pas être Tanzil
    s.versets[1]!.ar += '‏';
    expect(construireSourate(s, tanzil).erreurs.join('|')).toMatch(/texte différent de Tanzil/);
  });

  it('refuse un mot décalé, un mot sans sens, un nombre de versets faux', () => {
    const a = sourceValide();
    a.versets[0]!.mot_a_mot[0]!.ar += 'َ';
    expect(construireSourate(a, tanzil).erreurs.join('|')).toMatch(/mot à mot différent/);
    const b = sourceValide();
    b.versets[0]!.mot_a_mot[1]!.fr = ' ';
    expect(construireSourate(b, tanzil).erreurs.join('|')).toMatch(/mot sans sens/);
    const c = sourceValide();
    c.nombre_versets = 3;
    expect(construireSourate(c, tanzil).erreurs.join('|')).toMatch(/pour nombre_versets/);
  });

  it('refuse une plage illisible ou hors de la sourate', () => {
    const a = sourceValide();
    a.tafsir[0]!.point = 'Point (v. 1-9)';
    expect(construireSourate(a, tanzil).erreurs.join('|')).toMatch(/hors de la sourate/);
    const b = sourceValide();
    b.tafsir[0]!.point = 'Point (v. un à deux)';
    expect(construireSourate(b, tanzil).erreurs.join('|')).toMatch(/plage de versets illisible/);
  });

  it('un segment adulte exige sa note de contexte (D-TF-445) ; un segment marqué est conservé avec son acces', () => {
    const a = sourceValide();
    a.tafsir.push({
      point: 'Point adulte (v. 2)',
      explication: 'Texte adulte fictif.',
      acces: 'adulte',
    });
    expect(construireSourate(a, tanzil).erreurs.join('|')).toMatch(/sans note de contexte/);
    a.tafsir[1]!.note_contexte = 'Note de contexte fictive.';
    const r = construireSourate(a, tanzil);
    expect(r.erreurs).toEqual([]);
    expect(r.sourate.points[1]).toMatchObject({ id: 1, acces: 'adulte', plage: [[2, 2]] });
    expect(r.sourate.versets[1]!.p).toEqual([0, 1]);
    expect(r.sourate.versets[0]!.p).toEqual([0]);
  });

  it('refuse les marqueurs réservés ou internes dans un texte NON marqué', () => {
    for (const mauvais of [
      'mention publique INTERDITE avant relecture',
      'niveau adulte',
      'relecture du comité',
      'voir (CORPUS_CORAN.md)',
      'cf. D-TF-445',
      'cf. V-B5-817',
    ]) {
      const a = sourceValide();
      a.tafsir[0]!.explication = `Texte. ${mauvais}.`;
      expect(construireSourate(a, tanzil).erreurs.join('|'), mauvais).toMatch(/marqueur/);
    }
  });
});

describe('plages des points', () => {
  it.each([
    ['Titre (v. 4)', [[4, 4]]],
    ['Titre (v. 1-3)', [[1, 3]]],
    [
      'Titre (v. 1-3, 5)',
      [
        [1, 3],
        [5, 5],
      ],
    ],
    [
      'Titre (v. 4 et 6)',
      [
        [4, 4],
        [6, 6],
      ],
    ],
    [
      'Titre (v. 5-6 et 9)',
      [
        [5, 6],
        [9, 9],
      ],
    ],
    [
      'Titre (v. 1, 3, 5)',
      [
        [1, 1],
        [3, 3],
        [5, 5],
      ],
    ],
    ['Titre sans plage', []],
    ['« Al-ʿAṣr »', []],
  ])('%s', (titre, plage) => {
    expect(lirePlage(titre)).toEqual(plage);
  });
  it('plage illisible : null', () => {
    expect(lirePlage('Titre (v. 3-1)')).toBeNull();
    expect(lirePlage('Titre (v. trois)')).toBeNull();
  });
});

// ---------------------------------------------------------------- filtrage
function avecSegments(): SourateTafsir {
  const r = construireSourate(
    (() => {
      const s = sourceValide();
      s.tafsir = [
        { point: 'Ouvert (v. 1)', explication: 'Visible de tous.', sources: [] },
        {
          point: 'Adulte (v. 1-2)',
          explication: 'Visible des adultes.',
          acces: 'adulte',
          note_contexte: 'Contexte de l’adulte.',
        },
        {
          point: 'Réservé (v. 2)',
          explication: 'Visible du seul compte tout voir.',
          acces: 'interdit',
        },
        { point: 'Général de la sourate', explication: 'Texte général.', sources: [] },
      ] as SourceSourate['tafsir'];
      return s;
    })(),
    tanzil,
  );
  expect(r.erreurs).toEqual([]);
  return r.sourate;
}

describe('filtrage par public (D-TF-445, D-TF-498)', () => {
  const x = avecSegments();
  const titres = (y: SourateTafsir) => y.points.map((p) => p.titre);

  it('élève (enfant, ado, profil non adulte, sans profil) : ni adulte ni réservé', () => {
    for (const age of ['enfant', 'ado', null, undefined]) {
      const pub = publicDe({ toutVoir: false, age });
      expect(pub).toBe('eleve');
      const y = filtrerSourate(x, pub);
      expect(titres(y)).toEqual(['Ouvert (v. 1)', 'Général de la sourate']);
      expect(y.versets.map((v) => v.p)).toEqual([[0], []]);
      // aucune trace : ni le texte, ni la note de contexte, ni l'identifiant du segment retiré
      const brut = JSON.stringify(y);
      expect(brut).not.toMatch(/adulte|Réservé|tout voir|Contexte de l/i);
      expect(brut).not.toContain('"acces"');
    }
  });

  it('profil adulte : les segments adulte avec leur note de contexte, jamais le réservé', () => {
    const y = filtrerSourate(x, publicDe({ toutVoir: false, age: 'adulte' }));
    expect(titres(y)).toEqual(['Ouvert (v. 1)', 'Adulte (v. 1-2)', 'Général de la sourate']);
    expect(y.points[1]!.note_contexte).toBe('Contexte de l’adulte.');
    expect(JSON.stringify(y)).not.toMatch(/Réservé|tout voir/);
  });

  it('« tout voir » (compte du client, décidé par le serveur) : tout, même sans profil adulte', () => {
    const pub = publicDe({ toutVoir: true, age: 'enfant' });
    expect(pub).toBe('tout');
    expect(filtrerSourate(x, pub)).toEqual(x);
  });

  it('un segment sans marque est visible de tous ; la règle `voit` est monotone', () => {
    for (const p of ['eleve', 'adulte', 'tout'] as const) expect(voit(undefined, p)).toBe(true);
    expect([voit('adulte', 'eleve'), voit('adulte', 'adulte'), voit('adulte', 'tout')]).toEqual([
      false,
      true,
      true,
    ]);
    expect([
      voit('interdit', 'eleve'),
      voit('interdit', 'adulte'),
      voit('interdit', 'tout'),
    ]).toEqual([false, false, true]);
  });

  it('le filtrage ne modifie pas l’objet d’origine et rend le même objet quand rien n’est retiré', () => {
    const avant = JSON.stringify(x);
    filtrerSourate(x, 'eleve');
    expect(JSON.stringify(x)).toBe(avant);
    const sans = sourate(112);
    expect(filtrerSourate(sans, 'eleve')).toBe(sans);
  });
});
