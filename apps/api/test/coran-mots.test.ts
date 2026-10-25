/**
 * « Mots du Coran » (interrupteur `coran_mots`) — données, recherche, routes :
 *  - les données dérivées (GPL v3) sont intactes et reproductibles ; leurs formes recollent le texte de Tanzil OCTET POUR
 *    OCTET (verset par verset, basmala d'en-tête exclue) ;
 *  - la recherche par mot (avec ou sans voyelles) et par racine ; la normalisation ne sert qu'à comparer ;
 *  - les routes : interrupteur coupé par défaut, données à la demande, ETag, « connus » d'après la progression réelle,
 *    versets renvoyés tels quels, fiche racine SANS sens tant que le sens est « a_verifier ».
 * Les vérifications qui lisent le vrai Tanzil sont ignorées s'il est absent (CI) ; les autres n'en ont pas besoin.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DONNEES } from '@awform/coran-mots-data';
import { contentDir, schema as t, setFlagState, setProfileLevel } from '@awform/db';
import { loadTanzil } from '@awform/content';
import { splitBasmala } from '@awform/hifz';
import {
  chargerIndex,
  cleLache,
  cleRacine,
  cleStricte,
  indiceDuJeton,
  PAUSE,
} from '../src/coran-mots-recherche.js';
import { adult, child, parent, setup, type Ctx } from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;
const TANZIL = join(contentDir(), 'coran', 'tanzil-uthmani.tsv');
const lire = (nom: string) => readFileSync(join(DONNEES, nom), 'utf8');
const mots = () =>
  lire('mots.tsv')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'));

describe('données « Mots du Coran » (paquet GPL séparé)', () => {
  it('le paquet porte sa licence GPL v3, son attribution et le lien vers corpus.quran.com', () => {
    const dossier = join(DONNEES, '..');
    expect(readFileSync(join(dossier, 'LICENSE'), 'utf8')).toMatch(
      /GNU GENERAL PUBLIC LICENSE\s+Version 3/,
    );
    const notice = readFileSync(join(dossier, 'NOTICE.md'), 'utf8');
    expect(notice).toContain('http://corpus.quran.com');
    expect(notice).toContain('Kais Dukes');
    expect(notice).toContain('http://tanzil.net');
    const pkg = JSON.parse(readFileSync(join(dossier, 'package.json'), 'utf8'));
    expect(pkg.license).toBe('GPL-3.0-only');
    const meta = JSON.parse(lire('meta.json'));
    expect(meta.attribution).toContain('corpus.quran.com');
    expect(meta.licence).toBe('GPL-3.0-only');
  });

  it('aucun fichier de données n’a été modifié à la main (empreintes SHA-256 de meta.json)', () => {
    const meta = JSON.parse(lire('meta.json')) as { empreintes: Record<string, string> };
    expect(Object.keys(meta.empreintes)).toHaveLength(114 + 4);
    for (const [nom, sha] of Object.entries(meta.empreintes))
      expect(createHash('sha256').update(lire(nom)).digest('hex'), nom).toBe(sha);
  });

  it('la régénération depuis source/ redonne les mêmes octets', () => {
    const sortie = mkdtempSync(join(tmpdir(), 'cm-gen-'));
    const script = join(DONNEES, '..', 'scripts', 'generer.mjs');
    execFileSync(process.execPath, [script, '--sortie', sortie], { stdio: 'ignore' });
    for (const nom of [
      'mots.tsv',
      'lemmes.tsv',
      'rangs.json',
      'racines-sens.json',
      'meta.json',
      'sourates/001.json',
      'sourates/002.json',
      'sourates/114.json',
    ])
      expect(readFileSync(join(sortie, nom), 'utf8'), nom).toBe(lire(nom));
  });

  it.skipIf(!existsSync(TANZIL))(
    'les formes recollent le texte de Tanzil OCTET POUR OCTET, verset par verset (6 236 versets)',
    () => {
      const tanzil = loadTanzil(readFileSync(TANZIL, 'utf8'));
      expect(tanzil.size).toBe(6236);
      const formes = new Map<string, string[]>();
      for (const [ref, forme] of mots()) {
        const k = ref!.split(':').slice(0, 2).join(':');
        formes.set(k, [...(formes.get(k) ?? []), forme!]);
      }
      const basmala = tanzil.get('1:1')!;
      let ecarts = 0;
      for (const [ref, texte] of tanzil) {
        const [s, a] = ref.split(':').map(Number) as [number, number];
        // même séparation de la basmala que le lecteur ; les signes de pause isolés ne sont pas des mots
        const { rest } = splitBasmala(s, a, texte, basmala);
        const attendu = rest.split(' ').filter((x) => !PAUSE.test(x));
        const f = formes.get(ref) ?? [];
        if (attendu.length !== f.length || attendu.some((x, i) => x !== f[i])) ecarts++;
      }
      expect(ecarts).toBe(0);
    },
  );

  it('chaque sourate a, par verset, exactement un nombre par mot de la sourate (mots.tsv)', () => {
    const parVerset = new Map<string, number>();
    for (const [ref] of mots()) {
      const k = ref!.split(':').slice(0, 2).join(':');
      parVerset.set(k, (parVerset.get(k) ?? 0) + 1);
    }
    let versets = 0;
    for (let s = 1; s <= 114; s++) {
      const d = JSON.parse(lire(`sourates/${String(s).padStart(3, '0')}.json`)) as {
        s: number;
        v: unknown[][];
      };
      expect(d.s).toBe(s);
      d.v.forEach((mots, i) => {
        expect(mots.length, `${s}:${i + 1}`).toBe(parVerset.get(`${s}:${i + 1}`));
        versets++;
      });
    }
    expect(versets).toBe(6236);
  });
});

describe('recherche par mot et par racine (comparaison seulement)', () => {
  const idx = chargerIndex(DONNEES);

  it('clés de comparaison : voyelles, hamzas, alif de prolongation, variantes de clavier', () => {
    // sans voyelles = avec voyelles
    expect(cleStricte('كِتَٰب')).toBe(cleStricte('كتاب'));
    expect(cleStricte('ٱلْكِتَٰبِ')).toBe('الكتاب');
    // hamza et alif madda : « قرآن » (clavier) = « ٱلْقُرْءَانُ » (Tanzil)
    expect(cleStricte('قرآن')).toBe(cleStricte('قُرْءَان'));
    expect(cleStricte('مؤمن')).toBe(cleStricte('مُؤْمِن'));
    // lettres persanes et ى
    expect(cleStricte('كتاب')).toBe(cleStricte('کتاب'));
    expect(cleStricte('هدى')).toBe(cleStricte('هدي'));
    // le BOM, les espaces et le latin ne comptent pas
    expect(cleStricte('\u{FEFF}كتاب ab')).toBe('كتاب');
    // clé large : sans alif ni hamza (orthographe moderne ≠ Muṣḥaf)
    expect(cleLache('الرحمن')).toBe(cleLache('ٱلرَّحْمَٰنِ'));
    // racine : hamza → alif, espaces ignorés
    expect(cleRacine('أ م ن')).toBe(cleRacine('امن'));
  });

  it('« كتاب » trouve les mots du lemme (articles, pronoms suffixes), avec ou sans voyelles', () => {
    const a = idx.chercherMot('كتاب');
    const b = idx.chercherMot('كِتَابٌ');
    expect(a.approx).toBe(false);
    expect(a.mots.length).toBeGreaterThan(200);
    expect(b.mots.map((m) => `${m.s}:${m.a}:${m.ordre}`)).toEqual(
      a.mots.map((m) => `${m.s}:${m.a}:${m.ordre}`),
    );
    const cles = new Set(a.mots.map((m) => cleStricte(m.forme)));
    expect(cles.has('الكتاب')).toBe(true);
    expect(cles.has('كتابه')).toBe(true);
    // ordre du Coran
    const ordre = a.mots.map((m) => m.s * 1000 + m.a);
    expect([...ordre].sort((x, y) => x - y)).toEqual(ordre);
  });

  it('sans correspondance stricte : clé large (« الرحمن » écrit sans alif), signalée', () => {
    const r = idx.chercherMot('الرحمن');
    expect(r.approx).toBe(true);
    expect(r.mots.length).toBeGreaterThan(50);
    expect(idx.chercherMot('الرحمان').approx).toBe(false);
    expect(idx.chercherMot('zzzz').mots).toEqual([]);
    expect(idx.chercherMot('   ').mots).toEqual([]);
  });

  it('par racine : 3 lettres avec ou sans espaces, hamza ; la famille et sa fréquence', () => {
    expect(idx.racineDe('كتب')).toBe('ك ت ب');
    expect(idx.racineDe('ك ت ب')).toBe('ك ت ب');
    expect(idx.racineDe('أمن')).toBe('ا م ن');
    expect(idx.racineDe('ءمن')).toBe('ا م ن');
    expect(idx.racineDe('ضضض')).toBeNull();
    const fam = idx.famille('ك ت ب')!;
    expect(fam.frequence).toBe(319); // « Cette racine revient 319 fois dans le Coran » (étude)
    expect(fam.lemmes[0]!.ar).toBe('كِتَٰب');
    expect(fam.lemmes.map((l) => l.n).sort((x, y) => y - x)).toEqual(fam.lemmes.map((l) => l.n));
    expect(idx.motsDeRacine('ك ت ب')).toHaveLength(319);
    // filtre par lemme
    const kitab = fam.lemmes[0]!;
    expect(idx.motsDeRacine('ك ت ب', kitab.bw)).toHaveLength(kitab.n);
  });

  it('fréquences de la famille = celles de l’étude (200 racines, 1 364 lemmes)', () => {
    const src = JSON.parse(
      // l'étude complète est dans source/ (compressée) : on la relit comme le script
      execFileSync('gunzip', ['-c', join(DONNEES, '..', 'source', 'racines.json.gz')], {
        maxBuffer: 64 * 1024 * 1024,
      }).toString('utf8'),
    ) as {
      racines: Array<{
        racine: string;
        frequence_coran: number;
        famille: Array<{ lemme_bw: string; frequence: number }>;
      }>;
    };
    expect(src.racines).toHaveLength(200);
    let nb = 0;
    for (const r of src.racines) {
      const fam = idx.famille(r.racine)!;
      expect(fam.frequence, r.racine).toBe(r.frequence_coran);
      for (const f of r.famille) {
        nb++;
        expect(idx.lemmes.get(f.lemme_bw)?.n, `${r.racine} ${f.lemme_bw}`).toBe(f.frequence);
      }
    }
    expect(nb).toBe(1364);
  });

  it('indiceDuJeton : retrouve le mot dans le texte en sautant les signes de pause', () => {
    const texte = 'أ ۖ ب ج ۗ د';
    expect(indiceDuJeton(texte, 1)).toBe(0);
    expect(indiceDuJeton(texte, 2)).toBe(2);
    expect(indiceDuJeton(texte, 4)).toBe(5);
    expect(indiceDuJeton(texte, 5)).toBe(-1);
  });
});

describe.skipIf(!URL)('routes « Mots du Coran » (awform_test)', () => {
  let c: Ctx;
  let A: Record<string, string>;
  let profileId: string;
  let dossierModifie: string;
  /** versets de test reconstitués depuis les données (jamais écrits à la main) : 1, 2:1-3 et 112 */
  const verset = (s: number, a: number) =>
    mots()
      .filter(([ref]) => ref!.startsWith(`${s}:${a}:`))
      .map(([, forme]) => forme!)
      .join(' ');

  beforeAll(async () => {
    // dossier de données avec UNE racine dont le sens est validé (ا ل ه), pour montrer la différence
    dossierModifie = mkdtempSync(join(tmpdir(), 'cm-data-'));
    cpSync(DONNEES, dossierModifie, { recursive: true });
    const sens = JSON.parse(readFileSync(join(dossierModifie, 'racines-sens.json'), 'utf8'));
    expect(sens['ك ت ب'].a_verifier).toBe(true);
    sens['ع ل م'].a_verifier = false;
    writeFileSync(join(dossierModifie, 'racines-sens.json'), JSON.stringify(sens));

    c = await setup(URL!, [], { coranMotsDir: dossierModifie });
    await c.h.pool.query(
      `insert into level (code, track, rank, title_fr, subject_code) values
        ('ad1', 'adultes', 1, 'Adultes 1', 'arabe'), ('ad2', 'adultes', 2, 'Adultes 2', 'arabe')`,
    );
    await c.h.db.insert(t.levelVersion).values(
      ['ad1', 'ad2'].map((levelCode) => ({
        editionId: c.editionId,
        levelCode,
        book: { titre_fr: `Livre ${levelCode}`, titre_ar: 'كِتَابٌ' },
      })),
    );
    for (const [level, n] of [
      ['ad1', 1],
      ['ad2', 1],
      ['ad2', 2],
    ] as const) {
      const id = `${level}.l0${n}`;
      await c.h.db.insert(t.unit).values({ id, levelCode: level, n, kind: 'lecon' });
      await c.h.db.insert(t.unitVersion).values({
        editionId: c.editionId,
        unitId: id,
        numLecon: n,
        numBilan: null,
        titleAr: 'عُنْوَانٌ',
        titleFr: `Titre ${id}`,
        sha256: id,
        strictJson: true,
        content: { n, type: 'lecon', exercices: [] },
        student: { n, type: 'lecon', exercices: [] },
      });
    }
    // versets de la base : 1:1-2 (la basmala est le verset 1), 2:1 avec la basmala d'en-tête, 2:2
    const bas = verset(1, 1);
    const lignes: Array<[number, number, string]> = [
      [1, 1, bas],
      [1, 2, verset(1, 2)],
      [2, 1, `${bas} ${verset(2, 1)}`],
      [2, 2, verset(2, 2)],
      [2, 3, verset(2, 3)],
    ];
    for (const [sura, aya, text] of lignes)
      await c.h.db.insert(t.quranVerse).values({ sura, aya, text });
    ({ A, profileId } = await adult(c, 'cm-adulte@e2e.test'));
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.pool.end();
  });

  const get = (url: string, h: Record<string, string> = A) => c.req('GET', url, h);

  it('interrupteur COUPÉ par défaut : 403 « fonction_coupee » ; 401 sans connexion', async () => {
    expect((await get('/api/v1/coran-mots/sourates/1', {})).statusCode).toBe(401);
    const r = await get('/api/v1/coran-mots/sourates/1');
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toMatchObject({ code: 'fonction_coupee', fonction: 'coran_mots' });
    expect((await get('/api/v1/coran-mots/recherche?q=كتاب')).statusCode).toBe(403);
    expect((await get(`/api/v1/profiles/${profileId}/coran-mots/connus`)).statusCode).toBe(403);
  });

  it('ouvert : une sourate à la demande (octets du fichier), ETag, 304 ; rangs ; paramètres refusés', async () => {
    await setFlagState(c.h.db, 'coran_mots', 'on', null);
    const r = await get('/api/v1/coran-mots/sourates/112');
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe(lire('sourates/112.json'));
    expect(r.headers['cache-control']).toMatch(/private/);
    const etag = String(r.headers.etag);
    expect(
      (await get('/api/v1/coran-mots/sourates/112', { ...A, 'if-none-match': etag })).statusCode,
    ).toBe(304);
    expect((await get('/api/v1/coran-mots/sourates/115')).statusCode).toBe(400);
    expect((await get('/api/v1/coran-mots/sourates/0')).statusCode).toBe(400);
    const g = await get('/api/v1/coran-mots/rangs');
    expect(g.statusCode).toBe(200);
    expect(g.body).toBe(lire('rangs.json'));
  });

  it('« connus » = progression réelle : niveau, leçons faites, mots validés ; autre filière → indisponible', async () => {
    // aucun niveau choisi
    expect((await get(`/api/v1/profiles/${profileId}/coran-mots/connus`)).json()).toEqual({
      disponible: false,
      raison: 'aucun_niveau',
    });
    await setProfileLevel(c.h.db, profileId, 'ad2', 'choix');
    await c.h.db.insert(t.progress).values([
      { profileId, unitId: 'ad2.l01', status: 'terminee' },
      { profileId, unitId: 'ad2.l02', status: 'commencee' },
    ]);
    await c.h.pool.query(
      `insert into quran_lemma (rank, lemma_key, arabic, source_sha256) values (24, 'x24', 'إِذَا', 's'), (7, 'x7', 'x', 's')`,
    );
    await c.h.db.insert(t.profileLemma).values({ profileId, rank: 24, source: 'carte' });
    const r = await get(`/api/v1/profiles/${profileId}/coran-mots/connus`);
    expect(r.statusCode).toBe(200);
    // seules les leçons FAITES comptent (« commencee » n'est pas faite)
    expect(r.json()).toEqual({
      disponible: true,
      piste: 'ad',
      niveau: 2,
      unites: ['ad2.l01'],
      valides: [24],
    });
    // le profil d'un autre compte n'est pas lisible
    const autre = await adult(c, 'cm-autre@e2e.test');
    expect((await get(`/api/v1/profiles/${profileId}/coran-mots/connus`, autre.A)).statusCode).toBe(
      404,
    );
    // un enfant (filière « en ») : les livres ne sont pas encore reliés au Coran pour elle
    const p = await parent(c, 'cm-parent@e2e.test');
    const kid = await child(c, p.P, 'Petit');
    const k = await get(`/api/v1/profiles/${kid}/coran-mots/connus`, p.P);
    expect(k.statusCode).toBe(200);
    expect(k.json()).toMatchObject({ disponible: false });
  });

  it('recherche par mot : versets TELS QUE DANS la base (basmala séparée), mot repéré par son rang', async () => {
    const r = await get(`/api/v1/coran-mots/recherche?q=${encodeURIComponent('الرحيم')}`);
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j.mode).toBe('mot');
    expect(j.items.length).toBeGreaterThan(0);
    // 1:1 (« ٱلرَّحِيمِ » est le 4e mot) et 2:1 (basmala d'en-tête : le texte rendu ne la contient plus)
    const un = j.items.find((x: { ref: string }) => x.ref === '1:1');
    expect(un.texte).toBe(verset(1, 1));
    expect(un.texte.split(' ')[un.i]).toBe(un.forme);
    // les autres versets ne sont pas dans la base de ce test (texte vide)
    for (const it of j.items.filter((x: { texte: string }) => x.texte)) {
      expect(it.texte.split(' ')[it.i], it.ref).toBe(it.forme);
      expect(it.texte).not.toMatch(/^\u{FEFF}/u);
    }
    const lemmeFiltre = await get(
      `/api/v1/coran-mots/recherche?q=${encodeURIComponent('الرحيم')}&lemme=${encodeURIComponent(j.lemmes[0].bw)}`,
    );
    expect(lemmeFiltre.json().total).toBeLessThanOrEqual(j.total);
    expect((await get('/api/v1/coran-mots/recherche?q=')).statusCode).toBe(400);
    expect((await get(`/api/v1/coran-mots/recherche?q=${'ا'.repeat(61)}`)).statusCode).toBe(400);
    expect((await get('/api/v1/coran-mots/recherche?q=كتاب&page=0')).statusCode).toBe(400);
  });

  it('un verset 1 avec basmala d’en-tête est renvoyé SANS elle, comme dans le lecteur', async () => {
    type Item = { ref: string; texte: string; i: number; forme: string };
    // 2:1 : texte stocké = basmala + « الم » ; le résultat ne contient plus la basmala et le mot est repéré
    const r = await get(`/api/v1/coran-mots/recherche?q=${encodeURIComponent('الم')}`);
    const it = (r.json().items as Item[]).find((x) => x.ref === '2:1');
    expect(it?.texte).toBe(verset(2, 1));
    expect(it?.texte.split(' ')[it!.i]).toBe(it?.forme);
    // 2:2 (aucune basmala) : texte rendu = texte stocké, mot repéré par son rang
    const d = await get(`/api/v1/coran-mots/recherche?q=${encodeURIComponent('ذلك')}`);
    const v = (d.json().items as Item[]).find((x) => x.ref === '2:2');
    expect(v?.texte).toBe(verset(2, 2));
    expect(v?.texte.split(' ')[v!.i]).toBe(v?.forme);
    // un mot de la basmala : trouvé en 1:1 seulement (les jetons de basmala de tête ne sont pas des mots à chercher)
    const b = await get(`/api/v1/coran-mots/recherche?q=${encodeURIComponent('بسم')}`);
    const refs = (b.json().items as Array<{ ref: string }>).map((x) => x.ref);
    expect(refs).toContain('1:1');
    expect(refs).not.toContain('2:1');
  });

  it('recherche par racine : famille, fréquence, lemmes ; racine inconnue → aucun résultat', async () => {
    const r = await get(`/api/v1/coran-mots/recherche?mode=racine&q=${encodeURIComponent('كتب')}`);
    const j = r.json();
    expect(j.racine).toBe('ك ت ب');
    expect(j.total).toBe(319);
    expect(j.lemmes[0]).toMatchObject({ ar: 'كِتَٰب' });
    expect(j.items).toHaveLength(Math.min(20, 319));
    const p2 = await get(
      `/api/v1/coran-mots/recherche?mode=racine&q=${encodeURIComponent('كتب')}&page=16`,
    );
    expect(p2.json().items).toHaveLength(319 - 15 * 20);
    const vide = await get(
      `/api/v1/coran-mots/recherche?mode=racine&q=${encodeURIComponent('ضضض')}`,
    );
    expect(vide.json()).toMatchObject({ racine: null, total: 0, items: [] });
  });

  it('fiche racine : la famille toujours ; le SENS seulement s’il n’est pas « a_verifier »', async () => {
    // ك ت ب : sens a_verifier → jamais envoyé (même en cherchant dans la réponse entière)
    const k = await get(`/api/v1/coran-mots/racine?r=${encodeURIComponent('كتب')}`);
    expect(k.statusCode).toBe(200);
    const kj = k.json();
    expect(kj.racine).toBe('ك ت ب');
    expect(kj.frequence).toBe(319);
    expect(kj.famille.length).toBeGreaterThan(5);
    expect(kj.famille[0]).toMatchObject({ ar: 'كِتَٰب', rang: expect.any(Number) });
    expect(kj.famille[0].unite).toMatch(/^ad\d+\.l\d+$/);
    expect(kj).not.toHaveProperty('sens');
    expect(kj).not.toHaveProperty('sources');
    const original = JSON.parse(lire('racines-sens.json'))['ك ت ب'] as { sens: string };
    expect(k.body).not.toContain(original.sens);
    expect(kj.attribution).toContain('http://corpus.quran.com');
    // ع ل م : sens VALIDÉ dans le dossier de test → envoyé
    const m = await get(`/api/v1/coran-mots/racine?r=${encodeURIComponent('ع ل م')}`);
    expect(m.json().sens).toBeTruthy();
    // une racine « doute » reste muette, même si elle existe dans le fichier des sens
    const d = await get(`/api/v1/coran-mots/racine?r=${encodeURIComponent('اله')}`);
    expect(d.statusCode).toBe(200);
    expect(d.json()).not.toHaveProperty('sens');
    expect((await get(`/api/v1/coran-mots/racine?r=${encodeURIComponent('ضضض')}`)).statusCode).toBe(
      404,
    );
  });

  it('les données de production : aucun des 200 sens n’est affichable avant validation', () => {
    const sens = JSON.parse(lire('racines-sens.json')) as Record<string, { a_verifier: boolean }>;
    expect(Object.keys(sens)).toHaveLength(200);
    expect(Object.values(sens).every((s) => s.a_verifier)).toBe(true);
  });
});
