/**
 * V2-5, relecture de sécurité — points 3 et 6 : prénoms en arabe (identifiant, fiche), identifiants épuisés,
 * premier mot seulement.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema as t } from '@awform/db';
import { baseIdentifiant } from '../src/auth/enfant-login.js';
import { IdentifiantsEpuises, tirerIdentifiants } from '../src/ecole-eleves.js';
import {
  CaractereNonImprimable,
  ficheClassePdf,
  pourFiche,
  texteWinAnsi,
} from '../src/pdf-fiche.js';
import { newClass, setup, teacher, YEAR, type Ctx } from './helpers.js';
import { creerLot } from './eleves-aide.js';

const URL_ = process.env.TEST_DATABASE_URL;
const an = YEAR - 9;

describe('point 3 — arabe en latin simple, identifiants épuisés, fiche (sans base)', () => {
  it('la base de l’identifiant d’un prénom arabe est sa translittération, plus « enfant »', () => {
    expect(baseIdentifiant('أمينة')).toBe('amina');
    expect(baseIdentifiant('موسى')).toBe('musa');
    expect(baseIdentifiant('Aïcha')).toBe('aicha');
    expect(baseIdentifiant('李明')).toBe('enfant'); // autre écriture : reste « enfant »
  });
  it('des identifiants épuisés lèvent IdentifiantsEpuises (jamais une erreur interne obscure)', async () => {
    const faux = { select: () => ({ from: () => ({ where: async () => [] }) }) } as never;
    await expect(tirerIdentifiants(faux, ['Awa', 'Awa'], () => 100)).rejects.toBeInstanceOf(
      IdentifiantsEpuises,
    );
    // « enfant » : base raccourcie à 5 chiffres, toujours 24 caractères au plus
    const ids = await tirerIdentifiants(
      faux,
      Array.from({ length: 5 }, () => '李明'),
      (() => {
        let n = 0;
        return (min: number) => min + n++;
      })(),
    );
    expect(new Set(ids).size).toBe(5);
    for (const i of ids) expect(i).toMatch(/^enfant-\d{3}$/);
  });
  it('la fiche translittère l’arabe et refuse ce qui ne s’imprime pas', () => {
    expect(pourFiche('أمينة')).toBe('amina');
    expect(pourFiche('Éléonore')).toBe('Éléonore');
    expect(() => texteWinAnsi('李')).toThrow(CaractereNonImprimable);
    expect(() =>
      ficheClassePdf({
        ecole: null,
        classe: 'CE2',
        date: '2026-11-01',
        etiquettes: [{ prenom: '李明', login: 'enfant-123', motDePasse: 'k7m2x9qa' }],
      }),
    ).toThrow(CaractereNonImprimable);
    const pdf = ficheClassePdf({
      ecole: 'مدرسة النور',
      classe: 'القسم الأول',
      date: '2026-11-01',
      etiquettes: [{ prenom: 'أمينة', annee: 2017, login: 'amina-482', motDePasse: 'k7m2x9qa' }],
    }).toString('latin1');
    expect(pdf).not.toContain('?');
    expect(pdf).toContain('amina \\(2017\\)');
  });
});

describe.skipIf(!URL_)('points 3 et 6 — création en lot (awform_test)', () => {
  let c: Ctx;
  let T: Record<string, string>;
  let cls: { id: string };

  beforeAll(async () => {
    c = await setup(URL_!);
    T = await teacher(c, 'arabe@exemple.org');
    cls = await newClass(c, T, 'القسم الأول');
  }, 60_000);
  afterAll(async () => {
    await c.app.close();
    await c.h.close();
  });

  it('prénoms en arabe : identifiants latins, prénom conservé, fiche PDF lisible sans « ? »', async () => {
    const r = await creerLot(c, T, cls.id, [
      { prenom: 'أمينة', annee: an },
      { prenom: 'موسى', annee: an },
      { prenom: 'أمينة', annee: an },
    ]);
    expect(r.statusCode, r.body).toBe(201);
    const e = r.json().eleves as Array<{
      prenom: string;
      identifiant: string;
      motDePasse: string;
      pupilId: string;
      profileId: string;
    }>;
    expect(e[0]!.identifiant).toMatch(/^amina-\d{3,4}$/);
    expect(e[1]!.identifiant).toMatch(/^musa-\d{3,4}$/);
    expect(e[2]!.identifiant).not.toBe(e[0]!.identifiant);
    expect(e[0]!.prenom).toBe('أمينة');
    const [p] = await c.h.db.select().from(t.profile).where(eq(t.profile.id, e[0]!.profileId));
    expect(p!.pseudonym).toBe('أمينة');
    const f = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/fiche.pdf`, T, {
      eleves: e.map((x) => ({ pupilId: x.pupilId, motDePasse: x.motDePasse })),
    });
    expect(f.statusCode, f.body).toBe(200);
    const pdf = f.rawPayload.toString('latin1');
    expect(pdf).not.toContain('?');
    expect(pdf).toContain(`amina \\(${an}\\)`);
    expect(pdf).toContain(`(${e[0]!.identifiant})`);
  });

  it('un prénom sans forme imprimable : les comptes sont créés, la fiche est refusée (422), jamais de « ? »', async () => {
    const r = await creerLot(c, T, cls.id, [{ prenom: '李明', annee: an }]);
    expect(r.statusCode, r.body).toBe(201);
    const x = r.json().eleves[0];
    expect(x.identifiant).toMatch(/^enfant-\d{3,5}$/);
    const f = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/fiche.pdf`, T, {
      eleves: [{ pupilId: x.pupilId, motDePasse: x.motDePasse }],
    });
    expect(f.statusCode).toBe(422);
    expect(f.json().error.code).toBe('fiche_non_imprimable');
  });

  it('point 6 — seul le premier mot est gardé (jamais de nom de famille)', async () => {
    const r = await creerLot(c, T, cls.id, [{ prenom: 'Fatou Bintou Diop', annee: an }]);
    expect(r.statusCode, r.body).toBe(201);
    const x = r.json().eleves[0];
    expect(x.prenom).toBe('Fatou');
    expect(x.identifiant).toMatch(/^fatou-\d{3,4}$/);
    const [p] = await c.h.db.select().from(t.profile).where(eq(t.profile.id, x.profileId));
    expect(p!.pseudonym).toBe('Fatou');
    const [pu] = await c.h.db.select().from(t.classPupil).where(eq(t.classPupil.id, x.pupilId));
    expect(pu!.displayName).toBe('Fatou');
    expect(JSON.stringify(r.json())).not.toContain('Diop');
  });

  it('une marque d’orientation cachée dans le prénom est refusée', async () => {
    const r = await creerLot(c, T, cls.id, [{ prenom: 'Aw‮a', annee: an }]);
    expect(r.statusCode).toBe(400);
    expect(r.json().error.lignes).toEqual([{ ligne: 1, code: 'prenom_invalide' }]);
  });
});
