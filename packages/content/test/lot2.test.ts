import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { personaKey } from '../src/checks.js';
import { loadIllustrations, PERSONNAGES, SANS_VISAGE_FILE, validateSvg } from '../src/illus.js';
import { blockingIssues, loadEdition } from '../src/importer.js';
import {
  answerPaths,
  examProjection,
  forbiddenPaths,
  illustrationKeys,
  parentProjection,
  publicProjection,
  studentProjection,
} from '../src/projection.js';
import { importReportMarkdown } from '../src/report.js';
import { sceneSvg } from '../src/scene.js';
import { CONTENT_DIR, HAS_CONTENT } from './helpers.js';

describe('SVG : liste blanche', () => {
  it('accepte les formes de dessin', () => {
    expect(
      validateSvg(
        '<g color="#fff"><path d="M0 0h10" fill="#E5484D"/><circle cx="1" cy="2" r="3"/></g>',
      ),
    ).toEqual([]);
  });
  it('refuse script, texte, liens, évènements, url()', () => {
    expect(validateSvg('<script>alert(1)</script>').length).toBeGreaterThan(0);
    expect(validateSvg('<text x="1">A</text>').length).toBeGreaterThan(0);
    expect(validateSvg('<use href="#x"/>').length).toBeGreaterThan(0);
    expect(validateSvg('<path d="M0 0" onload="x()"/>').length).toBeGreaterThan(0);
    expect(validateSvg('<rect fill="url(#g)"/>').length).toBeGreaterThan(0);
    expect(validateSvg('<rect/>bonjour').length).toBeGreaterThan(0);
  });
});

describe('scènes (portage du moteur)', () => {
  it('compose décor, personnages, bulle échappée', () => {
    const s = sceneSvg({
      lieu: 'maison',
      persos: ['maman', 'youssouf'],
      bulle_ar: 'مَرْحَبًا|<b>',
    });
    expect(s).toContain('href="#i-maman"');
    expect(s).toContain('href="#i-youssouf"');
    expect(s).toContain('&lt;b&gt;');
    expect(s).not.toMatch(/<script|on\w+=/);
  });
  it('tableau de classe : lettres de la leçon colorées', () => {
    const s = sceneSvg({ lieu: 'classe' }, [{ l: 'ب' }, { l: 'ت' }]);
    expect(s).toContain('<tspan fill="#FF8D8F">ب</tspan>');
    expect(s).toContain('<tspan fill="#8DB8FF">ت</tspan>');
  });
  it('clé d’un personnage de dialogue', () => {
    expect(personaKey('Grandpère')).toBe('grandpere');
    expect(personaKey('Grand-mère')).toBe('grandmere');
    expect(personaKey('Youssouf')).toBe('youssouf');
  });
});

describe('projections', () => {
  const L = {
    type: 'examen',
    lecture: {
      vedette: { ar: 'x', fr: 'y' },
      phrases: [{ ar: 'a', fr: 'b' }],
      phrases_masquees: [{ ar: 'z' }],
    },
    coran: {
      versets: [
        { ar: 'v1', fr: 't1' },
        { ar: 'v2', non_prepare: true, ref_fr: '1:2' },
      ],
    },
    ecriture: { dictee: ['d'], mots: ['m'] },
    parents_fr: 'p',
    exercices: [
      { type: 'complete', items: [{ avant: 'a', options: ['x', 'y'], reponse: 'x' }] },
      {
        type: 'relier',
        items: [
          { ar: 'a', fr: '1' },
          { ar: 'b', fr: '2' },
        ],
      },
      { type: 'vrai_faux', items: [{ ar: 'a', vrai: true, correction_ar: 'c' }] },
    ],
  };
  it('élève : sans traduction d’examen, sans phrases masquées, sans texte non préparé ni dictée', () => {
    const s = studentProjection(L) as typeof L;
    expect(s.lecture.vedette).toEqual({ ar: 'x' });
    expect(s.lecture.phrases[0]).toEqual({ ar: 'a' });
    expect(s.lecture.phrases_masquees).toBeUndefined();
    expect(s.coran.versets).toEqual([{ ar: 'v1' }, { non_prepare: true }]);
    expect(s.ecriture).toEqual({ mots: ['m'] });
  });
  it('parent : + mot aux parents et dictée', () => {
    const p = parentProjection(L) as typeof L;
    expect(p.parents_fr).toBe('p');
    expect(p.ecriture.dictee).toEqual(['d']);
  });
  it('épreuve : aucune réponse ; relier en deux colonnes décalées', () => {
    const e = examProjection(L) as unknown as { exercices: Array<Record<string, unknown>> };
    expect(answerPaths(e)).toEqual([]);
    expect(e.exercices[1]).toMatchObject({
      gauche: [{ ar: 'a' }, { ar: 'b' }],
      droite: [{ fr: '2' }, { fr: '1' }],
    });
  });
  it('publique : ni exercices ni réponses', () => {
    const p = publicProjection({
      ...L,
      titre_ar: 't',
      mots: [{ ar: 'w', fr: 'f', img: 'door', tr: 'x' }],
    });
    expect(p.exercices).toBeUndefined();
    expect(p.mots).toEqual([{ ar: 'w', fr: 'f', img: 'door' }]);
  });
});

describe.skipIf(!HAS_CONTENT)('import complet réel (illustrations, contrôles, projections)', () => {
  // contenu absent (CI) : le bloc est ignoré, rien n'est chargé
  const load = !HAS_CONTENT
    ? (undefined as never)
    : loadEdition({ contentDir: CONTENT_DIR, levels: ['en1', 'ad1'] });

  it('illustrations : toutes valides, 12 personnages sans visage (zz-sansvisage.js en dernier)', () => {
    const il = loadIllustrations(join(CONTENT_DIR, 'illus'));
    expect(il.issues).toEqual([]);
    expect(il.illustrations.size).toBeGreaterThan(500);
    for (const k of PERSONNAGES) expect(il.illustrations.get(k)?.file).toBe(SANS_VISAGE_FILE);
  });
  it('aucune erreur bloquante ; toutes les illustrations utilisées existent', () => {
    expect(blockingIssues(load)).toEqual([]);
    for (const l of load.levels)
      for (const u of l.units)
        for (const k of illustrationKeys(studentProjection(u.content, l.code)))
          expect(load.illustrations?.has(k), `${u.id} : ${k}`).toBe(true);
  });
  it('épreuve : aucune clé de corrigé dans les 51 unités ; élève : aucun champ réservé', () => {
    for (const l of load.levels)
      for (const u of l.units) {
        expect(answerPaths(examProjection(u.content, l.code)), u.id).toEqual([]);
        expect(forbiddenPaths(studentProjection(u.content, l.code)), u.id).toEqual([]);
        expect(JSON.stringify(studentProjection(u.content, l.code))).not.toContain(
          'phrases_masquees',
        );
      }
  });
  it('bilans Enfants : seulement lettres, ligne de lecture et exercices', () => {
    const en1 = load.levels.find((l) => l.code === 'en1')!;
    for (const u of en1.units.filter((x) => x.kind !== 'lecon')) {
      const s = studentProjection(u.content, 'en1') as Record<string, unknown>;
      for (const k of ['dialogue', 'coran', 'fiqh_adab', 'mots'])
        expect(s[k], `${u.id}.${k}`).toBeUndefined();
    }
  });
  it('rapport d’import lisible', () => {
    const md = importReportMarkdown(load, 'test');
    expect(md).toContain('Erreurs bloquantes : 0');
    expect(md).toContain('| en1 | 26 |');
  });
});
