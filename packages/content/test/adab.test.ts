import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CERCLES,
  LIEUX,
  cerclesFor,
  countBy,
  inGroup,
  isoWeek,
  lieuxFor,
  splitEntryId,
  visibleEntries,
  visibleFiches,
  weeklyChallenge,
  type AdabEntry,
} from '../src/adab.js';
import {
  applyRangement,
  classifyAdab,
  entriesOfLesson,
  readAdabIndex,
} from '../src/adab-classer.js';
import { FICHES_ESSAI, parseFiche, readFiches } from '../src/akhlaq.js';
import { readAkhlaq } from '../src/importer.js';
import type { Issue } from '../src/types.js';

/** A37 — « Vivre l'islam », bon comportement : classement, filtres par âge et par niveau, import des fiches. */

const entry = (
  id: string,
  cercles: string[],
  lieux: string[] = [],
  extra: Partial<AdabEntry> = {},
) =>
  ({
    id: `${id}.fiqh_adab`,
    unit: id,
    level: id.split('.')[0]!,
    n: Number(id.slice(-2)),
    path: 'fiqh_adab',
    code: 'fiqh_adab',
    titre_fr: id,
    titre_ar: '',
    cercles,
    lieux,
    rangement: 'auto',
    ...extra,
  }) as AdabEntry;

describe('A37 — classement automatique prudent', () => {
  const c = (
    titre_fr: string,
    textes: string[] = [],
    level = 'en1',
    code: AdabEntry['code'] = 'fiqh_adab',
  ) => classifyAdab({ titre_fr, textes, level, code });

  it('un mot du titre suffit ; trois mentions dans le texte aussi ; une seule ne suffit pas', () => {
    expect(c('Les droits du voisin').cercles).toEqual(['voisins']);
    expect(c('Mon cœur', ['mon ami', 'un ami', 'ses amis']).cercles).toContain('amis');
    expect(c('Mon cœur', ['mon ami']).cercles).toEqual(['soi']);
  });
  it('« Allah » seul ne range rien ; le fiqh sans mot-clé va à « Allah et le Prophète ﷺ »', () => {
    expect(c('Allah aime', ['Allah', 'Allah', 'Allah']).cercles).toEqual(['soi']);
    expect(c('Les ablutions').cercles).toEqual(['allah_prophete']);
    expect(c('Sans mot-clé', [], 'ra1', 'fiqh').cercles).toEqual(['allah_prophete']);
  });
  it('« école mālikite » n’est pas l’école ; époux et éducation des enfants seulement chez les adultes', () => {
    expect(c('La prière selon l’école mālikite', [], 'ad10').cercles).not.toContain('ecole');
    expect(c('La prière selon l’école mālikite', [], 'ad10').lieux).not.toContain('ecole');
    expect(c('Le respect en classe').cercles).toContain('ecole');
    expect(c('Le mariage', [], 'ado2').cercles).not.toContain('epoux');
    expect(c('Le mariage', [], 'ad7').cercles).toContain('epoux');
    expect(c('Les enfants', [], 'en1').cercles).not.toContain('enfants');
    expect(c('Éduquer ses enfants', [], 'ad7').cercles).toContain('enfants');
  });
  it('lieux seulement quand ils sont clairs ; au plus trois cercles', () => {
    expect(c('À table', ['Je mange', 'le repas']).lieux).toEqual(['cuisine']);
    expect(c('À la mosquée').lieux).toEqual(['mosquee']);
    expect(c('Ma patience').lieux).toEqual([]);
    const many = c('Parents, voisins, amis, malades et animaux');
    expect(many.cercles.length).toBeLessThanOrEqual(3);
  });
  it('rubriques d’une leçon : bloc fiqh_adab et rubriques de sciences retenues ; défi « Je … » tel quel', () => {
    const L = {
      fiqh_adab: {
        titre_fr: 'Avec mes parents',
        titre_ar: 'مَعَ وَالِدَيَّ',
        points: [
          { ar: 'أ', fr: '« Une citation » (source)' },
          { ar: 'ب', fr: 'Je cite trois règles (leçon 4).' },
          { ar: 'ت', fr: 'Je range mes affaires.' },
        ],
      },
      rubriques: [
        { code: 'aqida', titre_fr: 'non retenue' },
        { code: 'usra', titre_fr: 'La famille', situations: [{}, {}, {}] },
      ],
    };
    const out = entriesOfLesson('ra1.l01', 'ra1', 1, L);
    expect(out.map((e) => e.id)).toEqual(['ra1.l01.fiqh_adab', 'ra1.l01.rubriques.1']);
    expect(out[0]).toMatchObject({
      code: 'fiqh_adab',
      titre_ar: 'مَعَ وَالِدَيَّ',
      defi: { ar: 'ت', fr: 'Je range mes affaires.' },
    });
    expect(out[0]!.cercles).toContain('parents');
    expect(out[1]).toMatchObject({ code: 'usra', situations: 3, cercles: ['famille'] });
    expect(out[1]!.defi).toBeUndefined();
    expect(entriesOfLesson('x.l01', 'x', 1, null)).toEqual([]);
  });
  it('index officiel > correction > automatique ; identifiants inconnus signalés', () => {
    const { map, problems } = readAdabIndex({
      entrees: [
        { id: 'en1.l01', cercles: ['amis', 'inconnu'], lieux: ['ecole'] },
        { id: 'en1.l02.fiqh_adab', lieux: ['rue'] },
      ],
    });
    expect(problems).toEqual(['en1.l01.fiqh_adab : cercles inconnu « inconnu »']);
    const auto = [
      entry('en1.l01', ['soi']),
      entry('en1.l02', ['parents'], ['maison']),
      entry('en1.l03', ['soi']),
    ];
    const out = applyRangement(auto, map, {
      'en1.l03.fiqh_adab': { cercles: ['nature'] },
      'en1.l01.fiqh_adab': { cercles: ['soi'] },
    });
    expect(out.map((e) => [e.cercles, e.lieux, e.rangement])).toEqual([
      [['amis'], ['ecole'], 'index'],
      [['parents'], ['rue'], 'index'],
      [['nature'], [], 'correction'],
    ]);
    expect(
      readAdabIndex({ entrees: { 'en1.l05': { cercles: ['voisins'] } } }).map.get(
        'en1.l05.fiqh_adab',
      ),
    ).toEqual({
      cercles: ['voisins'],
    });
    expect(readAdabIndex('n’importe quoi').problems.length).toBe(1);
  });
});

describe('A37 — filtres par âge et par niveau', () => {
  const E = [
    entry('en1.l01', ['parents'], ['maison']),
    entry('en1.l02', ['epoux']),
    entry('en1.l03', ['epoux', 'soi'], ['travail', 'cuisine']),
    entry('ad1.l01', ['travail'], ['travail']),
  ];
  it('rubriques des leçons atteintes seulement ; cercles et lieux d’un autre âge retirés', () => {
    const enfant = visibleEntries(E, {
      kind: 'enfant',
      units: new Set(['en1.l01', 'en1.l02', 'en1.l03']),
    });
    expect(enfant.map((e) => e.unit)).toEqual(['en1.l01', 'en1.l03']);
    expect(enfant[1]).toMatchObject({ cercles: ['soi'], lieux: ['cuisine'] });
    const adulte = visibleEntries(E, { kind: 'adulte', units: new Set(['ad1.l01', 'en1.l02']) });
    expect(adulte.map((e) => e.unit)).toEqual(['en1.l02', 'ad1.l01']);
    // sans filtre de niveau (visiteur, famille) : tout, selon l'âge
    expect(visibleEntries(E, { kind: null, units: null })).toHaveLength(4);
  });
  it('cercles et lieux proposés par âge', () => {
    expect(cerclesFor('enfant').map((c) => c.id)).not.toContain('epoux');
    expect(cerclesFor('enfant').map((c) => c.id)).not.toContain('travail');
    expect(cerclesFor('ado').map((c) => c.id)).toContain('travail');
    expect(cerclesFor('adulte')).toHaveLength(CERCLES.length);
    expect(CERCLES).toHaveLength(18);
    expect(LIEUX).toHaveLength(9);
    expect(lieuxFor('enfant').map((l) => l.id)).not.toContain('travail');
  });
  it('fiches : de son âge, prérequis atteints, essais seulement en test', () => {
    const F = [
      {
        id: 'a',
        titre_fr: 'A',
        cercles: ['amis' as const],
        lieux: [],
        ages: ['enfant' as const],
        prerequis: [],
      },
      {
        id: 'b',
        titre_fr: 'B',
        cercles: ['amis' as const],
        lieux: [],
        ages: ['adulte' as const],
        prerequis: [],
      },
      {
        id: 'c',
        titre_fr: 'C',
        cercles: ['amis' as const],
        lieux: [],
        ages: ['enfant' as const],
        prerequis: ['en1.l09'],
      },
      {
        id: 'd',
        titre_fr: 'D',
        cercles: ['amis' as const],
        lieux: [],
        ages: ['enfant' as const],
        prerequis: [],
        test: true,
      },
    ];
    const who = { kind: 'enfant' as const, units: new Set(['en1.l01']) };
    expect(visibleFiches(F, who).map((f) => f.id)).toEqual(['a']);
    expect(visibleFiches(F, who, true).map((f) => f.id)).toEqual(['a', 'd']);
    expect(
      visibleFiches(F, { kind: 'enfant', units: new Set(['en1.l09']) }).map((f) => f.id),
    ).toEqual(['a', 'c']);
  });
  it('regroupement et comptes par cercle et par lieu', () => {
    expect(inGroup(E, 'cercle', 'epoux').map((e) => e.unit)).toEqual(['en1.l02', 'en1.l03']);
    expect(inGroup(E, 'lieu', 'travail').map((e) => e.unit)).toEqual(['en1.l03', 'ad1.l01']);
    expect(countBy(E, 'cercle')).toEqual({ parents: 1, epoux: 2, soi: 1, travail: 1 });
  });
});

describe('A37 — défi de la semaine', () => {
  const E = [
    entry('en1.l01', ['soi'], [], { defi: { ar: 'أ', fr: 'Je range.' } }),
    entry('en1.l02', ['soi'], [], { defi: { fr: 'Je salue.' } }),
    entry('en1.l03', ['soi']),
  ];
  it('semaine ISO : change le lundi', () => {
    expect(isoWeek(new Date(2026, 9, 5))).toEqual({ year: 2026, week: 41 });
    expect(isoWeek(new Date(2026, 9, 11))).toEqual({ year: 2026, week: 41 });
    expect(isoWeek(new Date(2026, 9, 12))).toEqual({ year: 2026, week: 42 });
    expect(isoWeek(new Date(2027, 0, 1))).toEqual({ year: 2026, week: 53 });
  });
  it('le même toute la semaine pour un élève, pris dans les rubriques à défi ; fiches d’abord', () => {
    const lundi = weeklyChallenge(E, [], new Date(2026, 9, 5), 'p1');
    const dimanche = weeklyChallenge(E, [], new Date(2026, 9, 11), 'p1');
    expect(lundi).toEqual(dimanche);
    expect(lundi?.kind).toBe('rubrique');
    expect(['Je range.', 'Je salue.']).toContain(lundi?.fr);
    const seen = new Set(
      Array.from(
        { length: 20 },
        (_, i) => weeklyChallenge(E, [], new Date(2026, 0, 5 + 7 * i), 'p1')?.fr,
      ),
    );
    expect(seen.size).toBe(2);
    const f = weeklyChallenge(
      E,
      [{ id: 'f', titre_fr: 'F', cercles: [], lieux: [], ages: [], defi_fr: 'Défi F' }],
      new Date(),
      'p1',
    );
    expect(f).toMatchObject({ kind: 'fiche', fiche: 'f', fr: 'Défi F' });
    expect(weeklyChallenge([entry('en1.l03', ['soi'])], [], new Date())).toBeNull();
  });
  it('identifiant de rubrique → leçon et chemin', () => {
    expect(splitEntryId('ra1.l01.rubriques.3')).toEqual({ unit: 'ra1.l01', path: 'rubriques.3' });
    expect(splitEntryId('ad10.l05.fiqh_adab')).toEqual({ unit: 'ad10.l05', path: 'fiqh_adab' });
    expect(splitEntryId('../x')).toBeNull();
  });
});

describe('A37 — fiches du livret « Bon comportement » (import)', () => {
  const ok = {
    id: 'akh.ecole.01',
    titre_fr: 'En classe',
    cercles: ['ecole'],
    lieux: ['ecole'],
    ages: ['enfant', 'ado'],
    situation_fr: 'Situation.',
    etapes: {
      avant: [{ fr: 'Avant.', statut: 'recommande' }],
      pendant: [{ fr: 'Pendant.', statut: 'obligatoire', ar: 'عَرَبِيٌّ', source_fr: 'Source' }],
      apres: [],
    },
    dire: [{ ar: 'عَرَبِيٌّ', fr: 'Traduction', source_fr: 'Source' }],
    situations: [{ question_fr: 'Que fais-tu si… ?', reponse_fr: 'Réponse.' }],
    defi_fr: 'Défi.',
  };
  it('fiche valide lue telle quelle (textes non modifiés)', () => {
    const r = parseFiche(ok);
    expect(r.errors).toEqual([]);
    expect(r.fiche).toMatchObject({ id: 'akh.ecole.01', prerequis: [], defi_fr: 'Défi.' });
    expect(r.fiche!.etapes.pendant[0]).toEqual(ok.etapes.pendant[0]);
  });
  it('fiche invalide refusée avec ses motifs', () => {
    const r = parseFiche(
      {
        ...ok,
        id: 'X Y',
        ages: [],
        cercles: ['inconnu'],
        lieux: [],
        etapes: { avant: [{ fr: 'a' }, { fr: 'b', statut: 'peut-etre' }] },
        dire: [{ fr: 'sans arabe' }],
      },
      'f.json',
    );
    expect(r.fiche).toBeNull();
    expect(r.errors).toEqual([
      'f.json : identifiant invalide « X Y »',
      'f.json : cercles : « inconnu » inconnu',
      'f.json : ni cercle ni lieu',
      'f.json : ages manquants (enfant, ado, adulte)',
      'f.json : etapes.avant[0] : statut manquant',
      'f.json : etapes.avant[1] : statut « peut-etre » inconnu',
      'f.json : dire[0] : arabe et traduction exigés',
    ]);
  });
  it('identifiants en double refusés ; fiches d’essai valides et marquées', () => {
    const r = readFiches([
      { file: '1.json', raw: ok },
      { file: '2.json', raw: ok },
    ]);
    expect(r.fiches).toHaveLength(1);
    expect(r.errors).toEqual(['2.json : identifiant « akh.ecole.01 » en double']);
    for (const f of FICHES_ESSAI) {
      expect(parseFiche(f).errors).toEqual([]);
      expect(f.test).toBe(true);
    }
    const statuts = new Set(
      FICHES_ESSAI.flatMap((f) =>
        [...f.etapes.avant, ...f.etapes.pendant, ...f.etapes.apres].map((p) => p.statut),
      ),
    );
    expect(statuts.size).toBe(5);
  });
  it('dossier data/akhlaq des livres : index et fiches importés, erreurs signalées sans bloquer', () => {
    const dir = mkdtempSync(join(tmpdir(), 'akhlaq-'));
    mkdirSync(join(dir, 'fiches'));
    writeFileSync(
      join(dir, 'index-adab.json'),
      JSON.stringify({ entrees: { 'en1.l01': { cercles: ['amis'] } } }),
    );
    writeFileSync(join(dir, 'fiches', 'a.json'), JSON.stringify(ok));
    writeFileSync(join(dir, 'fiches', 'b.json'), '{ illisible');
    writeFileSync(
      join(dir, 'fiches', 'c.json'),
      JSON.stringify({ ...ok, id: 'essai.x', test: true }),
    );
    const issues: Issue[] = [];
    const docs = readAkhlaq(dir, issues);
    expect(docs['akhlaq.index']).toEqual({
      entrees: { 'en1.l01.fiqh_adab': { cercles: ['amis'] } },
    });
    expect(
      (docs['akhlaq.fiches'] as { fiches: Array<{ id: string }> }).fiches.map((f) => f.id),
    ).toEqual(['akh.ecole.01']);
    expect(issues.every((i) => i.severity === 'avertissement')).toBe(true);
    expect(issues.map((i) => i.message)).toEqual([
      'data/akhlaq/fiches/b.json : fiche illisible (objet JSON attendu)',
    ]);
    expect(readAkhlaq(join(dir, 'absent'), [])).toEqual({});
  });
});
