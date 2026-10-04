/**
 * Collection ra* (ados/adultes) — décisions du chef de projet du 04/10/2026 :
 *  - cas pratique non résolu : réponse proposée visible d'un ADULTE autonome seulement APRÈS sa propre réponse,
 *    par une route dédiée ; projection élève inchangée ; élève d'une classe et ados : refus.
 * Contenu : copie du contenu synthétique avec un niveau « ra1 » fabriqué à partir de « ad1 » (aucun texte
 * religieux : cas et réponse synthétiques).
 */
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pjoin } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { carnetLine, unresolvedCase } from '../src/pratique-adulte.js';
import { SYNTH_DIR } from './content.js';
import {
  adult,
  child,
  join,
  newClass,
  parent,
  setupEdition,
  teacher,
  type Ctx,
} from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;

const CAS = {
  code: 'cas',
  titre_fr: 'Cas pratiques',
  cas: [
    { titre_fr: 'Cas 1', situation_fr: 'S1', question_fr: 'Q1', resolu: true, etapes_fr: ['e1'] },
    {
      titre_fr: 'Cas 2',
      situation_fr: 'S2',
      question_fr: 'Q2 ?',
      resolu: false,
      analyse_fr: 'A2',
      reponse_fr: 'REPONSE_PROPOSEE synthétique (Muslim 54).',
    },
  ],
};

/** contenu synthétique + niveau ra1 (copie de ad1 avec un cas pratique et une ligne de carnet en l01) */
export function synthWithRa1(): string {
  const dir = mkdtempSync(pjoin(tmpdir(), 'awform-ra1-'));
  cpSync(SYNTH_DIR, dir, { recursive: true, filter: (s) => !s.endsWith('/coran') });
  symlinkSync(realpathSync(pjoin(SYNTH_DIR, 'coran')), pjoin(dir, 'coran'));
  cpSync(pjoin(dir, 'data/ad1'), pjoin(dir, 'data/ra1'), { recursive: true });
  const book = pjoin(dir, 'data/ra1/book.js');
  writeFileSync(book, readFileSync(book, 'utf8').replace('"code": "ad1"', '"code": "ra1"'));
  const l01 = pjoin(dir, 'data/ra1/l01.js');
  writeFileSync(
    l01,
    readFileSync(l01, 'utf8').replace(
      '"n": 1,',
      `"n": 1,\n"rubriques": [${JSON.stringify(CAS)}],\n"carnet": {"fr": "Je relis la leçon chaque jour."},`,
    ),
  );
  const idxFile = pjoin(dir, 'data/index-lecons.js');
  const src = readFileSync(idxFile, 'utf8');
  const idx = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1)) as Record<
    string,
    unknown
  >;
  for (const [k, v] of Object.entries(idx))
    if (k.startsWith('ad1.')) idx[k.replace('ad1.', 'ra1.')] = v;
  writeFileSync(idxFile, `AW.index = ${JSON.stringify(idx, null, 1)};\n`);
  return dir;
}

describe('ra* — cas pratique : fonction pure', () => {
  it('seulement un cas non résolu qui porte une réponse proposée', () => {
    const L = { rubriques: [CAS] };
    expect(unresolvedCase(L, 'r0c1')).toEqual({ reponse: CAS.cas[1]!.reponse_fr });
    expect(unresolvedCase(L, 'r0c0')).toBeNull(); // résolu : rien à cacher
    expect(unresolvedCase(L, 'r1c0')).toBeNull();
    expect(unresolvedCase(L, 'x')).toBeNull();
  });
});

describe.skipIf(!URL_)('ra* — cas pratique d’un adulte autonome', () => {
  let c: Ctx;
  beforeAll(async () => {
    c = await setupEdition(URL_!, {}, synthWithRa1(), ['en1', 'ad1', 'ra1']);
  }, 60_000);
  afterAll(async () => {
    await c?.app.close();
    await c?.h.pool.end();
  });

  const url = (p: string, cas = 'r0c1') => `/api/v1/profiles/${p}/cas/ra1.l01/${cas}`;

  it('projection élève inchangée : la réponse proposée n’y est pas', async () => {
    const r = await c.req('GET', '/api/v1/units/ra1.l01');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.body).not.toContain('REPONSE_PROPOSEE');
    expect(r.json().unit.lesson.rubriques[0].cas[1]).toMatchObject({ resolu: false });
  });

  it('adulte autonome : réponse proposée seulement après sa propre réponse', async () => {
    const { A, profileId } = await adult(c, 'ra-adulte@test.fr');
    expect((await c.req('GET', url(profileId), A)).json().error.code).toBe('tentative_requise');
    const court = await c.req('POST', url(profileId), A, { texte: '  trop  ' });
    expect(court.json().error.code).toBe('reponse_trop_courte');
    const ok = await c.req('POST', url(profileId), A, { texte: 'Ma réponse personnelle au cas.' });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().reponse).toContain('REPONSE_PROPOSEE');
    // numéro de hadith non vérifié (aucun registre ici) : masqué comme dans la leçon (CON-3)
    expect(ok.json().reponse).not.toContain('54');
    const again = (await c.req('GET', url(profileId), A)).json();
    expect(again).toMatchObject({ texte: 'Ma réponse personnelle au cas.' });
    expect(again.reponse).toContain('REPONSE_PROPOSEE');
    // cas résolu (réponse déjà dans la leçon) ou inexistant : rien
    expect(
      (await c.req('POST', url(profileId, 'r0c0'), A, { texte: 'x'.repeat(20) })).statusCode,
    ).toBe(404);
    // un autre compte ne voit pas ce profil
    const B = await adult(c, 'ra-autre@test.fr');
    expect((await c.req('GET', url(profileId), B.A)).statusCode).toBe(404);
  });

  it('élève d’une classe, enfant ou ado : l’enseignant donne la réponse', async () => {
    const T = await teacher(c, 'ra-prof@test.fr');
    const cls = await newClass(c, T, 'RA');
    const { A, profileId } = await adult(c, 'ra-classe@test.fr');
    await join(c, A, profileId, cls);
    const r = await c.req('POST', url(profileId), A, { texte: 'Ma réponse personnelle au cas.' });
    expect(r.json().error.code).toBe('reponse_par_enseignant');
    const { P } = await parent(c, 'ra-parent@test.fr');
    for (const age of [10, 15]) {
      const kid = await child(c, P, `Kid${age}`, age);
      const k = await c.req(
        'POST',
        url(kid),
        { ...P, 'x-parent-pin': '4821' },
        {
          texte: 'Ma réponse personnelle au cas.',
        },
      );
      expect(k.json().error.code, `âge ${age}`).toBe('reponse_par_enseignant');
    }
    expect((await c.req('GET', url(profileId), T)).statusCode).toBe(403);
  });

  it('carnet ra* : liste personnelle de l’adulte, à cocher, sans signature', async () => {
    const { A, profileId } = await adult(c, 'ra-carnet@test.fr');
    const base = `/api/v1/profiles/${profileId}/carnet-perso`;
    const l0 = (await c.req('GET', base, A)).json();
    expect(l0.lignes).toEqual([
      {
        unitId: 'ra1.l01',
        niveau: 'ra1',
        ar: '',
        fr: 'Je relis la leçon chaque jour.',
        coche: false,
      },
    ]);
    expect((await c.req('PUT', `${base}/ra1.l01`, A, { coche: true })).json()).toEqual({
      unitId: 'ra1.l01',
      coche: true,
    });
    expect((await c.req('GET', base, A)).json().lignes[0].coche).toBe(true);
    await c.req('PUT', `${base}/ra1.l01`, A, { coche: false });
    expect((await c.req('GET', base, A)).json().lignes[0].coche).toBe(false);
    // leçon sans ligne de carnet ; leçon hors ra* (en1/ad1 : carnet du lot 22)
    expect((await c.req('PUT', `${base}/ra1.l02`, A, { coche: true })).statusCode).toBe(404);
    expect((await c.req('PUT', `${base}/ad1.l01`, A, { coche: true })).statusCode).toBe(400);
    // enfant : carnet signé du lot 22, pas cette liste ; autre compte : introuvable
    const { P } = await parent(c, 'ra-carnet-parent@test.fr');
    const kid = await child(c, P, 'Kid');
    const k = await c.req('GET', `/api/v1/profiles/${kid}/carnet-perso`, P);
    expect(k.json().error.code).toBe('reserve_adulte');
    expect((await c.req('GET', base, P)).statusCode).toBe(404);
  });
});

describe('ra* — ligne de carnet : fonction pure', () => {
  it('objet {ar?, fr?} non vide seulement', () => {
    expect(carnetLine({ fr: 'x' })).toEqual({ ar: '', fr: 'x' });
    expect(carnetLine({ ar: 'ب', fr: 'y' })).toEqual({ ar: 'ب', fr: 'y' });
    for (const v of [null, 'x', [], {}, { fr: 3 }]) expect(carnetLine(v)).toBeNull();
  });
});
