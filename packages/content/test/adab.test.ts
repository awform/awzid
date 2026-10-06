import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CERCLES,
  LIEUX,
  cerclesFor,
  countBy,
  ficheDefi,
  inGroup,
  isoWeek,
  lieuxFor,
  pointText,
  resumeOf,
  situationFor,
  splitEntryId,
  statutLabel,
  verseRef,
  visibleEntries,
  visibleFiches,
  weeklyChallenge,
  type AdabEntry,
  type FicheResume,
} from '../src/adab.js';
import {
  applyRangement,
  classifyAdab,
  entriesOfLesson,
  readAdabIndex,
} from '../src/adab-classer.js';
import { FICHES_ESSAI, parseFiche, readFiches, sourceLabel } from '../src/akhlaq.js';
import { readAkhlaq, readGuideChapter } from '../src/importer.js';
import type { Issue } from '../src/types.js';

/**
 * A37 — « Vivre l'islam », bon comportement : index officiel des livres (B9) et classement de repli, filtres par
 * âge et par niveau, fiches au format des livres (texte par âge, étiquettes), import du dossier `data/akhlaq`.
 */

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

/** Fiche au format des livres (B9), textes synthétiques. */
const brute = (extra: Record<string, unknown> = {}) => ({
  format: 'awzid-akhlaq-fiche',
  id: 'akh.f900',
  version: 1,
  theme: 'proprete',
  titre_fr: 'Fiche synthétique',
  titre_ar: 'تَجْرِبَةٌ',
  cercle: 'soi',
  cercles_lies: ['allah_prophete'],
  lieux: ['toilettes'],
  ages: ['enfant', 'ado', 'adulte'],
  situation: { enfant: 'Situation enfant.', tous: 'Situation pour tous.' },
  etapes: {
    avant: [
      {
        id: 'akh.f900.av1',
        fr: 'Point A.',
        enfant_fr: 'Point A enfant.',
        statut: 'recommande',
        force: 'forte',
        src: ['HAD_X_1', 'RIS.x', 'QUR:2:222', 'FIQH_MAL_interne'],
      },
    ],
    pendant: [
      {
        id: 'akh.f900.pe1',
        fr: 'Point B.',
        enfant_fr: 'Point B enfant.',
        ado_fr: 'Point B ado.',
        statut: 'interdit',
      },
      {
        id: 'akh.f900.pe2',
        fr: 'Point C adultes.',
        statut: 'conseil',
        ages: ['adulte'],
        note_fr: 'Note.',
      },
    ],
    apres: [],
  },
  dire: [
    {
      id: 'akh.f900.d1',
      role: 'dire',
      type: 'hadith',
      had: 'HAD_X_1',
      ar: 'نَصٌّ',
      fr: 'Texte.',
      enfant_fr: 'Texte enfant.',
      audio: true,
    },
    {
      id: 'akh.f900.d2',
      role: 'rappel',
      type: 'coran',
      src: '2:222',
      ar: 'آيَةٌ',
      fr: 'Sens.',
      audio: false,
      recitation: '2:222',
    },
  ],
  pourquoi_fr: 'Pourquoi.',
  pourquoi_enfant_fr: 'Pourquoi enfant.',
  vraie_vie: [
    { pays: ['tous'], fr: 'Partout.' },
    { pays: ['SN'], fr: 'Au Sénégal.' },
  ],
  defi_fr: 'Défi.',
  defi_enfant_fr: 'Défi enfant.',
  liens: { lecons: ['en1.l07'], fiches: ['akh.f901'], gp: ['gp.c18'] },
  statut_redaction: 'TRANCHE_REFERENT_PROVISOIRE',
  ...extra,
});
const LABELS = {
  ouvrage: (k: string) => (k === 'RIS.x' ? 'ar-Risāla' : null),
  hadith: (k: string) => (k === 'HAD_X_1' ? 'Rapporté par Recueil (1)' : null),
};

describe('A37 — classement de repli (sans index officiel)', () => {
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
  it('« Allah » seul ne range rien ; « école mālikite » n’est pas l’école ; époux seulement chez les adultes', () => {
    expect(c('Allah aime', ['Allah', 'Allah', 'Allah']).cercles).toEqual(['soi']);
    expect(c('Les ablutions').cercles).toEqual(['allah_prophete']);
    expect(c('La prière selon l’école mālikite', [], 'ad10').cercles).not.toContain('ecole');
    expect(c('Le mariage', [], 'ado2').cercles).not.toContain('epoux');
    expect(c('Le mariage', [], 'ad7').cercles).toContain('epoux');
    expect(c('Le téléphone').cercles).toEqual(['numerique']);
  });
  it('rubriques d’une leçon : bloc fiqh_adab et rubriques de religion ; défi « Je … » tel quel', () => {
    const out = entriesOfLesson('ra1.l01', 'ra1', 1, {
      fiqh_adab: {
        titre_fr: 'Avec mes parents',
        points: [
          { ar: 'أ', fr: '« Une citation »' },
          { ar: 'ب', fr: 'Je cite trois règles (leçon 4).' },
          { ar: 'ت', fr: 'Je range mes affaires.' },
        ],
      },
      rubriques: [
        { code: 'aqida' },
        { code: 'usra', titre_fr: 'La famille', situations: [{}, {}] },
      ],
    });
    expect(out.map((e) => e.id)).toEqual(['ra1.l01.fiqh_adab', 'ra1.l01.rubriques.1']);
    expect(out[0]!.defi).toEqual({ ar: 'ت', fr: 'Je range mes affaires.' });
    expect(out[1]).toMatchObject({ code: 'usra', situations: 2, cercles: ['famille'] });
  });
});

describe('A37 — index officiel des livres (B9)', () => {
  const index = {
    format: 'awzid-akhlaq-index',
    rubriques: [
      {
        id: 'en1.l01.adab',
        livre: 'en1',
        lecon: 'l01',
        titre_fr: 'Titre 1',
        cercle: 'amis',
        cercles_lies: ['soi'],
        lieux: ['ecole'],
        fiches: ['akh.f001'],
      },
      {
        id: 'ra1.l01.r2',
        livre: 'ra1',
        lecon: 'l01',
        titre_fr: 'Autre titre',
        cercle: 'inconnu',
        lieux: ['rue'],
      },
      { id: 'ra1.l02.r1', titre_fr: 'Introuvable', cercle: 'soi' },
    ],
  };
  it('lecture : cercle + cercles liés, lieux, fiches ; identifiants inconnus signalés', () => {
    const { rows, problems } = readAdabIndex(index);
    expect(rows[0]).toEqual({
      id: 'en1.l01.adab',
      unit: 'en1.l01',
      titre_fr: 'Titre 1',
      cercles: ['amis', 'soi'],
      lieux: ['ecole'],
      fiches: ['akh.f001'],
    });
    expect(problems).toEqual(['ra1.l01.r2 : cercle « inconnu » inconnu']);
    expect(readAdabIndex({}).problems).toEqual(['index vide ou illisible']);
    // forme réduite gardée par l'import : relue à l'identique
    expect(readAdabIndex({ rubriques: rows }).rows).toEqual(rows);
  });
  it('l’index REMPLACE le classement : ses seules rubriques, repérées par titre ou par identifiant', () => {
    const auto = [
      entry('en1.l01', ['soi'], [], { titre_fr: 'Titre 1' }),
      entry('en1.l02', ['soi'], [], { titre_fr: 'Absente de l’index' }),
      {
        ...entry('ra1.l01', ['soi']),
        id: 'ra1.l01.rubriques.1',
        path: 'rubriques.1',
        titre_fr: 'Autre titre',
      },
    ];
    const { entries, unmatched } = applyRangement(auto, readAdabIndex(index).rows);
    expect(entries.map((e) => [e.id, e.cercles, e.lieux, e.rangement])).toEqual([
      ['en1.l01.fiqh_adab', ['amis', 'soi'], ['ecole'], 'index'],
      ['ra1.l01.rubriques.1', [], ['rue'], 'index'],
    ]);
    expect(entries[0]!.fiches).toEqual(['akh.f001']);
    expect(unmatched).toEqual(['ra1.l02.r1']);
    // sans index : classement automatique et corrections
    const r = applyRangement(auto, null, { 'en1.l02.fiqh_adab': { cercles: ['voisins'] } });
    expect(r.entries.map((e) => [e.cercles, e.rangement])).toEqual([
      [['soi'], 'auto'],
      [['voisins'], 'correction'],
      [['soi'], 'auto'],
    ]);
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
    expect(visibleEntries(E, { kind: 'ado', units: null }).map((e) => e.unit)).toEqual([
      'en1.l01',
      'en1.l03',
      'ad1.l01',
    ]);
    expect(visibleEntries(E, { kind: null, units: null })).toHaveLength(4);
  });
  it('cercles des livres : Époux et Enfants aux adultes, Travail aux ados et adultes', () => {
    expect(CERCLES.map((c) => c.id)).toEqual([
      'soi',
      'allah_prophete',
      'parents',
      'fratrie',
      'epoux',
      'enfants',
      'famille',
      'voisins',
      'amis',
      'ecole',
      'travail',
      'autorites',
      'espace_public',
      'fragiles',
      'musulmans_avis',
      'autres_religions',
      'animaux_nature',
      'numerique',
    ]);
    expect(LIEUX).toHaveLength(9);
    expect(cerclesFor('enfant').map((c) => c.id)).not.toContain('travail');
    expect(cerclesFor('ado').map((c) => c.id)).not.toContain('epoux');
    expect(cerclesFor('ado').map((c) => c.id)).toContain('travail');
    expect(lieuxFor('enfant').map((l) => l.id)).not.toContain('travail');
  });
  it('fiches : de leur âge, rangées pour cet âge ; essais seulement en test', () => {
    const F: FicheResume[] = [
      { id: 'a', titre_fr: 'A', cercles: ['amis'], lieux: [], ages: ['enfant'] },
      { id: 'b', titre_fr: 'B', cercles: ['amis'], lieux: [], ages: ['adulte'] },
      { id: 'c', titre_fr: 'C', cercles: ['travail'], lieux: ['travail'], ages: ['enfant', 'ado'] },
      { id: 'd', titre_fr: 'D', cercles: ['amis'], lieux: [], ages: ['enfant'], test: true },
    ];
    const who = { kind: 'enfant' as const, units: new Set<string>() };
    expect(visibleFiches(F, who).map((f) => f.id)).toEqual(['a']);
    expect(visibleFiches(F, who, true).map((f) => f.id)).toEqual(['a', 'd']);
    expect(visibleFiches(F, { kind: 'ado', units: null }).map((f) => f.id)).toEqual(['c']);
    expect(inGroup(F, 'cercle', 'amis').map((f) => f.id)).toEqual(['a', 'b', 'd']);
    expect(countBy(E, 'cercle')).toEqual({ parents: 1, epoux: 2, soi: 1, travail: 1 });
  });
});

describe('A37 — fiche au format des livres : texte par âge, étiquettes, sources', () => {
  const { fiche, errors } = parseFiche(brute(), 'f.json', LABELS);
  it('lue telle quelle, sources rendues lisibles (clés internes non montrées)', () => {
    expect(errors).toEqual([]);
    expect(fiche).toMatchObject({
      id: 'akh.f900',
      cercles: ['soi', 'allah_prophete'],
      lieux: ['toilettes'],
      ages: ['enfant', 'ado', 'adulte'],
    });
    expect(fiche!.etapes.avant[0]!.sources_fr).toEqual([
      'Rapporté par Recueil (1)',
      'ar-Risāla',
      'Coran 2:222',
    ]);
    expect(fiche!.dire.map((d) => [d.type, d.role, d.source_fr])).toEqual([
      ['hadith', 'dire', 'Rapporté par Recueil (1)'],
      ['coran', 'rappel', 'Coran 2:222'],
    ]);
    expect(fiche!.dire[1]).toMatchObject({ src: '2:222', recitation: '2:222' });
    expect(fiche!.liens).toEqual({ lecons: ['en1.l07'], fiches: ['akh.f901'], gp: ['gp.c18'] });
    expect(sourceLabel('MATN_X', LABELS)).toBeNull();
  });
  it('texte par âge : enfant_fr pour l’enfant, ado_fr ou fr, point réservé à un âge', () => {
    const [b, c] = fiche!.etapes.pendant;
    expect([pointText(b!, 'enfant'), pointText(b!, 'ado'), pointText(b!, 'adulte')]).toEqual([
      'Point B enfant.',
      'Point B ado.',
      'Point B.',
    ]);
    expect([pointText(c!, 'enfant'), pointText(c!, 'ado'), pointText(c!, 'adulte')]).toEqual([
      null,
      null,
      'Point C adultes.',
    ]);
    expect(situationFor(fiche!, 'enfant')).toBe('Situation enfant.');
    expect(situationFor(fiche!, 'ado')).toBe('Situation pour tous.');
    expect([ficheDefi(fiche!, 'enfant'), ficheDefi(fiche!, 'adulte')]).toEqual([
      'Défi enfant.',
      'Défi.',
    ]);
  });
  it('étiquettes (référent) : force forte = « Recommandé · sunna », à éviter, conseil neutre', () => {
    expect(statutLabel(fiche!.etapes.avant[0]!)).toEqual({
      statut: 'recommande',
      precision: 'sunna',
      eviter: false,
    });
    expect(statutLabel(fiche!.etapes.pendant[0]!)).toEqual({
      statut: 'interdit',
      precision: null,
      eviter: true,
    });
    expect(statutLabel(fiche!.etapes.pendant[1]!)).toEqual({
      statut: 'conseil',
      precision: null,
      eviter: false,
    });
  });
  it('refusée : statut inconnu, texte enfant manquant, verset avec audio, cercle inconnu', () => {
    const r = parseFiche(
      brute({
        cercle: 'inconnu',
        etapes: { avant: [{ fr: 'x', statut: 'peut-etre' }], pendant: [], apres: [] },
        dire: [
          { role: 'rappel', type: 'coran', src: '2:222', ar: 'آيَةٌ', fr: 'Sens.', audio: true },
        ],
      }),
      'f.json',
    );
    expect(r.fiche).toBeNull();
    expect(r.errors).toEqual([
      'f.json : cercle « inconnu » inconnu',
      'f.json : etapes.avant[0] : statut « peut-etre » inconnu',
      "f.json : etapes.avant[0] : texte de l'enfant manquant (enfant_fr)",
      'f.json : dire[0] : verset sans référence, ou avec un audio de synthèse',
    ]);
  });
  it('doublons refusés ; fiches d’essai valides, marquées, aux six statuts', () => {
    const r = readFiches([
      { file: '1.json', raw: brute() },
      { file: '2.json', raw: brute() },
    ]);
    expect(r.fiches).toHaveLength(1);
    expect(r.errors).toEqual(['2.json : identifiant « akh.f900 » en double']);
    expect(FICHES_ESSAI).toHaveLength(3);
    expect(FICHES_ESSAI.every((f) => f.test)).toBe(true);
    const statuts = new Set(
      FICHES_ESSAI.flatMap((f) =>
        [...f.etapes.avant, ...f.etapes.pendant, ...f.etapes.apres].map((p) => p.statut),
      ),
    );
    expect(statuts.size).toBe(6);
    expect(resumeOf(fiche!)).toEqual({
      id: 'akh.f900',
      titre_fr: 'Fiche synthétique',
      titre_ar: 'تَجْرِبَةٌ',
      theme: 'proprete',
      cercles: ['soi', 'allah_prophete'],
      lieux: ['toilettes'],
      ages: ['enfant', 'ado', 'adulte'],
      defi_fr: 'Défi.',
      defi_enfant_fr: 'Défi enfant.',
    });
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
  it('le même toute la semaine pour un élève ; fiches d’abord, texte de son âge', () => {
    const lundi = weeklyChallenge(E, [], new Date(2026, 9, 5), 'p1');
    expect(lundi).toEqual(weeklyChallenge(E, [], new Date(2026, 9, 11), 'p1'));
    expect(lundi?.kind).toBe('rubrique');
    const seen = new Set(
      Array.from(
        { length: 20 },
        (_, i) => weeklyChallenge(E, [], new Date(2026, 0, 5 + 7 * i), 'p1')?.fr,
      ),
    );
    expect(seen.size).toBe(2);
    const F: FicheResume[] = [
      {
        id: 'f',
        titre_fr: 'F',
        cercles: [],
        lieux: [],
        ages: [],
        defi_fr: 'Défi F',
        defi_enfant_fr: 'Défi F enfant',
      },
    ];
    expect(weeklyChallenge(E, F, new Date(), 'p1')).toMatchObject({
      kind: 'fiche',
      fiche: 'f',
      fr: 'Défi F',
    });
    expect(weeklyChallenge(E, F, new Date(), 'p1', 'enfant')?.fr).toBe('Défi F enfant');
    expect(weeklyChallenge([entry('en1.l03', ['soi'])], [], new Date())).toBeNull();
  });
  it('identifiants de rubrique et références de verset', () => {
    expect(splitEntryId('ra1.l01.rubriques.3')).toEqual({ unit: 'ra1.l01', path: 'rubriques.3' });
    expect(splitEntryId('../x')).toBeNull();
    expect(verseRef('7:31')).toEqual({ s: 7, a: 31 });
    expect(verseRef('2:255-257')).toEqual({ s: 2, a: 255, a2: 257 });
    expect(verseRef('x')).toBeNull();
  });
});

describe('A37 — dossier data/akhlaq des livres et chapitre du guide des parents (import)', () => {
  it('index, fiches et sources importés ; erreurs signalées sans bloquer', () => {
    const dir = mkdtempSync(join(tmpdir(), 'akhlaq-'));
    mkdirSync(join(dir, 'fiches'));
    writeFileSync(
      join(dir, 'index-adab.json'),
      JSON.stringify({
        format: 'awzid-akhlaq-index',
        rubriques: [{ id: 'en1.l01.adab', titre_fr: 'T', cercle: 'amis' }],
      }),
    );
    writeFileSync(
      join(dir, 'sources.json'),
      JSON.stringify({
        format: 'awzid-akhlaq-sources',
        sources: { 'RIS.x': { ouvrage: 'ar-Risāla' } },
      }),
    );
    writeFileSync(join(dir, 'fiches', 'akh.f900.json'), JSON.stringify(brute()));
    writeFileSync(join(dir, 'fiches', 'b.json'), '{ illisible');
    writeFileSync(
      join(dir, 'fiches', 'c.json'),
      JSON.stringify({ ...brute(), id: 'essai.x', test: true }),
    );
    const issues: Issue[] = [];
    const docs = readAkhlaq(dir, issues, {
      HAD_X_1: { recueil: 'Recueil', numero: 1, statut: 'VERIFIE' },
    });
    expect((docs['akhlaq.index'] as { rubriques: unknown[] }).rubriques).toEqual([
      {
        id: 'en1.l01.adab',
        unit: 'en1.l01',
        titre_fr: 'T',
        cercles: ['amis'],
        lieux: [],
        fiches: [],
      },
    ]);
    const fiches = (
      docs['akhlaq.fiches'] as {
        fiches: Array<{ id: string; dire: Array<{ source_fr?: string }> }>;
      }
    ).fiches;
    expect(fiches.map((f) => f.id)).toEqual(['akh.f900']);
    expect(fiches[0]!.dire[0]!.source_fr).toBe('Rapporté par Recueil (1)');
    expect(issues.map((i) => [i.severity, i.message])).toEqual([
      ['avertissement', 'data/akhlaq/fiches/b.json : fiche illisible (objet JSON attendu)'],
    ]);
    // un hadith non VERIFIE au registre n'est pas cité comme source
    const d2 = readAkhlaq(dir, [], {
      HAD_X_1: { recueil: 'Recueil', numero: 1, statut: 'A_VERIFIER' },
    });
    const f2 = (d2['akhlaq.fiches'] as { fiches: Array<{ dire: Array<{ source_fr?: string }> }> })
      .fiches;
    expect(f2[0]!.dire[0]!.source_fr).toBeUndefined();
    expect(readAkhlaq(join(dir, 'absent'), [])).toEqual({});
  });
  it('chapitre gp.c18 lu tel quel s’il existe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gp-'));
    mkdirSync(join(dir, 'gp'));
    expect(readGuideChapter(dir, 'gp.c18', [])).toBeNull();
    writeFileSync(
      join(dir, 'gp', 'c18.js'),
      'AW.texteChapitre({"id": "gp.c18", "titre_fr": "Transmettre les valeurs", "sections": []});',
    );
    expect(readGuideChapter(dir, 'gp.c18', [])).toMatchObject({
      id: 'gp.c18',
      titre_fr: 'Transmettre les valeurs',
    });
    expect(readGuideChapter(dir, '../x', [])).toBeNull();
  });
});
