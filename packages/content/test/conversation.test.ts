import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  genererScenario,
  motsDuDialogue,
  roleEleve,
  scenarioJson,
  verifierScenario,
  type LeconSource,
  type Scenario,
} from '../src/conversation.js';
import { genererNiveau, niveauxDisponibles } from '../src/cli-conversation.js';

const L = (
  id: string,
  rep: Array<[string, string, string?]>,
  extra: Partial<LeconSource['lesson']> = {},
): LeconSource => ({
  id,
  lesson: {
    dialogue: {
      titre_ar: 'عُنْوَانٌ',
      lieu: 'classe',
      repliques: rep.map(([qui, ar, fr]) => ({ qui, ar, ...(fr ? { fr } : {}) })),
    },
    ...extra,
  },
});

const l1 = L('en1.l01', [
  ['A', 'السَّلَامُ عَلَيْكُمْ.', 'Bonjour.'],
  ['B', 'وَعَلَيْكُمُ السَّلَامُ.', 'Bonjour à toi.'],
  ['A', 'مَا اسْمُكَ؟', 'Comment tu t’appelles ?'],
  ['B', 'اسْمِي يُوسُفُ.', 'Je m’appelle Youssouf.'],
]);
const l2 = L(
  'en1.l02',
  [
    ['C', 'السَّلَامُ عَلَيْكُمْ.'],
    ['D', 'أَهْلًا! هٰذَا [بَ]ابٌ.', 'Voici une porte.'],
    ['C', 'شُكْرًا.', 'Merci.'],
    ['D', 'عَفْوًا.', 'De rien.'],
  ],
  {
    mots: [
      { ar: '[بَ]ابٌ', fr: 'une porte', img: 'door' },
      { ar: 'قَلَمٌ', fr: 'un stylo' },
    ],
  },
);
const l3 = L('en1.l03', [
  ['A', 'كَيْفَ حَالُكَ؟'],
  ['B', 'بِخَيْرٍ.'],
]);
const futur = L('en1.l09', [
  ['X', 'جُمْلَةٌ مِنَ الْمُسْتَقْبَلِ.'],
  ['Y', 'جُمْلَةٌ أُخْرَى.'],
]);
const autreNiveau = L('en2.l01', [
  ['X', 'جُمْلَةٌ مِنْ مُسْتَوًى آخَرَ.'],
  ['Y', 'جُمْلَةٌ ثَانِيَةٌ.'],
]);
const niveau = [l1, l2, l3, futur];

const phrases = (s: Scenario) =>
  s.tours.flatMap((t) => (t.t === 'partenaire' ? [t.ar] : t.choix.map((c) => c.ar)));

describe('A26b — générateur de scénarios (sans IA)', () => {
  it("l'élève joue le personnage qui parle le plus, hors celui qui ouvre la scène", () => {
    expect(
      roleEleve([
        { qui: 'A', ar: 'x' },
        { qui: 'B', ar: 'y' },
        { qui: 'A', ar: 'z' },
      ]),
    ).toBe('B');
    expect(roleEleve([{ qui: 'A', ar: 'x' }])).toBeNull();
  });

  it('aucune phrase hors livres : chaque texte arabe est copié octet par octet (balisage compris)', () => {
    const s = genererScenario(l2, [...niveau, autreNiveau])!;
    const livres = new Set(
      [l1, l2].flatMap((l) =>
        (l.lesson.dialogue!.repliques as Array<{ ar: string }>).map((r) => r.ar),
      ),
    );
    for (const p of phrases(s)) expect(livres.has(p), p).toBe(true);
    expect(phrases(s)).toContain('أَهْلًا! هٰذَا [بَ]ابٌ.');
    expect(verifierScenario(s, niveau)).toEqual([]);
  });

  it('distracteurs : du niveau seulement, jamais d’une leçon à venir ni d’un autre niveau', () => {
    for (const l of [l1, l2, l3]) {
      const s = genererScenario(l, [...niveau, autreNiveau])!;
      for (const t of s.tours)
        if (t.t === 'eleve')
          for (const c of t.choix) {
            expect(c.src.startsWith('en1.')).toBe(true);
            expect(c.src.startsWith('en1.l09')).toBe(false);
            if (c.kind === 'reprendre') expect(c.src < l.id).toBe(true);
          }
      expect(phrases(s).join(' ')).not.toMatch(/الْمُسْتَقْبَلِ|مُسْتَوًى/u);
    }
  });

  it('une bonne réponse par étape, la réplique du livre ; choix sans doublon ; position variable', () => {
    const s = genererScenario(l2, niveau)!;
    const etapes = s.tours.filter((t) => t.t === 'eleve');
    expect(etapes.length).toBe(2);
    for (const t of etapes) {
      expect(t.choix.filter((c) => c.kind === 'bonne')).toHaveLength(1);
      expect(t.choix.length).toBeGreaterThanOrEqual(2);
      expect(t.choix.length).toBeLessThanOrEqual(3);
    }
    expect(etapes.map((t) => t.choix.find((c) => c.kind === 'bonne')!.ar)).toEqual([
      'أَهْلًا! هٰذَا [بَ]ابٌ.',
      'عَفْوًا.',
    ]);
  });

  it("une phrase qui répondait à la même question n'est jamais un distracteur (elle serait juste aussi)", () => {
    // l2 commence par « السَّلَامُ عَلَيْكُمْ » comme l1 : « وَعَلَيْكُمُ السَّلَامُ » ne doit pas être proposé faux
    const s = genererScenario(l2, niveau)!;
    const premier = s.tours.find((t) => t.t === 'eleve')!;
    expect(premier.t === 'eleve' && premier.choix.map((c) => c.ar)).not.toContain(
      'وَعَلَيْكُمُ السَّلَامُ.',
    );
  });

  it('déterministe : deux générations donnent exactement le même fichier', () => {
    expect(scenarioJson(genererScenario(l3, niveau)!)).toBe(
      scenarioJson(genererScenario(l3, niveau)!),
    );
  });

  it('mots nouveaux : ceux de la leçon présents dans le dialogue (pour « Mes mots »)', () => {
    expect(motsDuDialogue(l2)).toEqual([{ ar: '[بَ]ابٌ', fr: 'une porte', img: 'door' }]);
  });

  it('le vérificateur rejette une phrase inventée ou tirée d’une leçon à venir', () => {
    const s = genererScenario(l2, niveau)!;
    const faux = structuredClone(s);
    const t = faux.tours.find((x) => x.t === 'eleve')!;
    if (t.t === 'eleve') t.choix[0]!.ar = 'جُمْلَةٌ مُخْتَرَعَةٌ.';
    expect(verifierScenario(faux, niveau).length).toBeGreaterThan(0);
    const futurS = structuredClone(s);
    const t2 = futurS.tours.find((x) => x.t === 'eleve')!;
    if (t2.t === 'eleve') {
      const c = t2.choix.find((x) => x.kind !== 'bonne')!;
      c.kind = 'reprendre';
      c.src = 'en1.l09#0';
      c.ar = 'جُمْلَةٌ مِنَ الْمُسْتَقْبَلِ.';
    }
    expect(verifierScenario(futurS, niveau).join(' ')).toMatch(/hors niveau|non encore vue/);
  });

  it('niveaux de religion ou dialogue trop court : pas de scénario', () => {
    expect(genererScenario({ ...l1, id: 're1.l01' }, [])).toBeNull();
    expect(genererScenario(L('en1.l04', [['A', 'مَرْحَبًا.']]), [])).toBeNull();
  });
});

// ---------------------------------------------------------------- vrais livres (hors CI)
const DIR = process.env.AWFORM_CONTENT_DIR ?? join(homedir(), 'awform-content');
const DATA = join(DIR, 'data');
const REAL = existsSync(join(DATA, 'index-lecons.js')) && !existsSync(join(DIR, 'SYNTHETIQUE.md'));
const STATIC = join(import.meta.dirname, '..', '..', '..', 'apps', 'web', 'static', 'conversation');

describe.skipIf(!REAL)('A26b — scénarios des vrais livres', () => {
  it('en1, en2, ad1 : un scénario par leçon qui a un dialogue', () => {
    for (const lv of ['en1', 'en2', 'ad1'])
      expect(genererNiveau(DATA, lv).scenarios.length, lv).toBeGreaterThanOrEqual(24);
  });

  it('tous les niveaux : 0 écart de contrôle, fichiers du dépôt identiques à la génération', () => {
    for (const lv of niveauxDisponibles(DATA)) {
      const { scenarios, errs } = genererNiveau(DATA, lv);
      expect(errs, lv).toEqual([]);
      for (const s of scenarios) {
        const f = join(STATIC, lv, `${s.lecon}.json`);
        expect(existsSync(f) && readFileSync(f, 'utf8') === scenarioJson(s), f).toBe(true);
      }
    }
  });
});
