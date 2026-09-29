/**
 * Lot 20 (V1-e) — certificats signés et vérifiables par QR : signature Ed25519 des champs du registre,
 * code de vérification posé une fois, vérification publique sans énumération (même réponse pour un numéro
 * inconnu et un mauvais code, essais limités), annulation par l'enseignant, clé publique publiée.
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema as t } from '@awform/db';
import {
  parseCertSignKey,
  signCert,
  verifyCert,
  VERIF_CODE,
  newVerifCode,
} from '../src/certsign.js';
import { newClass, setupEdition, teacher, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const KEY = `v1:${randomBytes(32).toString('hex')}`;
const signer = parseCertSignKey(KEY)!;
const FIELDS = {
  number: 'AWF-EN1-2026-0001',
  kind: 'niveau',
  subject: 'en1',
  holderName: 'Awa D.',
  mention: 'Très bien',
  issuedAt: new Date('2026-09-29T10:00:00Z'),
};

describe('signature des certificats (sans base)', () => {
  it('Ed25519 : vérifiée avec la clé publique ; un champ changé ou une autre clé la rendent invalide', () => {
    expect(parseCertSignKey('pas une clé')).toBeNull();
    expect(signer.publicPem).toContain('BEGIN PUBLIC KEY');
    const sig = signCert(signer, FIELDS);
    expect(verifyCert(signer.publicKey, FIELDS, sig)).toBe(true);
    expect(verifyCert(signer.publicKey, { ...FIELDS, mention: 'Bien' }, sig)).toBe(false);
    expect(verifyCert(signer.publicKey, { ...FIELDS, holderName: 'Awa  D.' }, sig)).toBe(false);
    const other = parseCertSignKey(randomBytes(32).toString('hex'))!;
    expect(other.keyId).not.toBe(signer.keyId);
    expect(verifyCert(other.publicKey, FIELDS, sig)).toBe(false);
    expect(verifyCert(signer.publicKey, FIELDS, 'abc')).toBe(false);
  });
  it('code de vérification : 12 caractères sans ambiguïté, aléatoire', () => {
    const codes = new Set(Array.from({ length: 200 }, () => newVerifCode()));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(VERIF_CODE.test(c)).toBe(true);
  });
});

describe.skipIf(!URL_)('lot 20 — vérification publique (awform_test)', () => {
  let c: Ctx;
  let T: Record<string, string>;
  let T2: Record<string, string>;
  let certId = '';
  let code = '';

  beforeAll(async () => {
    c = await setupEdition(URL_!, { certSigner: signer });
    T = await teacher(c, 'maitre20@ecole.example');
    T2 = await teacher(c, 'autre20@ecole.example');
    const cls = await newClass(c, T, 'Classe 20');
    const [me] = await c.h.db
      .select({ id: t.account.id })
      .from(t.account)
      .where(eq(t.account.email, 'maitre20@ecole.example'));
    // certificat déjà au registre (délivré avant le lot 20 : ni code ni signature)
    const [row] = await c.h.db
      .insert(t.certificate)
      .values({
        ...FIELDS,
        classId: cls.id,
        issuedBy: me!.id,
        document: { lignes: [] },
      })
      .returning({ id: t.certificate.id });
    certId = row!.id;
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('première lecture par l’enseignant : code et signature posés une seule fois', async () => {
    const r1 = (await c.req('GET', `/api/v1/ecole/certificats/${certId}`, T)).json().certificate;
    expect(r1.verifCode).toMatch(VERIF_CODE);
    expect(r1.keyId).toBe(signer.keyId);
    const r2 = (await c.req('GET', `/api/v1/ecole/certificats/${certId}`, T)).json().certificate;
    expect(r2.verifCode).toBe(r1.verifCode);
    expect(r2.signature).toBe(r1.signature);
    expect((await c.req('GET', `/api/v1/ecole/certificats/${certId}`, T2)).statusCode).toBe(404);
    code = r1.verifCode;
  });

  it('vérification publique : registre, statut, signature ; rien sans le bon code', async () => {
    const ok = await c.req('GET', `/api/v1/public/certificats/${FIELDS.number}?c=${code}`);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      numero: FIELDS.number,
      titulaire: 'Awa D.',
      mention: 'Très bien',
      sujetTitre: 'Enfants — niveau 1 (synthétique)',
      statut: 'valide',
      signature: 'valide',
    });
    expect(JSON.stringify(ok.json())).not.toContain('lignes'); // jamais le document complet
    const bad = await c.req('GET', `/api/v1/public/certificats/${FIELDS.number}?c=AAAAAAAAAAAA`);
    const unknown = await c.req('GET', `/api/v1/public/certificats/AWF-EN1-2026-9999?c=${code}`);
    expect(bad.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(bad.body).toBe(unknown.body);
    // registre modifié en base (fraude) : signature invalide
    await c.h.db
      .update(t.certificate)
      .set({ mention: 'Excellent' })
      .where(eq(t.certificate.id, certId));
    expect(
      (await c.req('GET', `/api/v1/public/certificats/${FIELDS.number}?c=${code}`)).json()
        .signature,
    ).toBe('invalide');
    await c.h.db
      .update(t.certificate)
      .set({ mention: FIELDS.mention })
      .where(eq(t.certificate.id, certId));
  });

  it('annulation par l’enseignant qui l’a délivré ; motif affiché', async () => {
    const url = `/api/v1/ecole/certificats/${certId}/annuler`;
    expect((await c.req('POST', url, T2, { motif: 'erreur' })).statusCode).toBe(404);
    expect((await c.req('POST', url, T, { motif: 'erreur de saisie du nom' })).statusCode).toBe(
      200,
    );
    expect((await c.req('POST', url, T, { motif: 'encore' })).statusCode).toBe(409);
    const v = (await c.req('GET', `/api/v1/public/certificats/${FIELDS.number}?c=${code}`)).json();
    expect(v).toMatchObject({ statut: 'annule', annulation: { motif: 'erreur de saisie du nom' } });
  });

  it('clé publique publiée ; essais faux limités par adresse', async () => {
    const k = (await c.req('GET', '/api/v1/public/certificats/cle')).json();
    expect(k).toMatchObject({
      algorithme: 'Ed25519',
      keyId: signer.keyId,
      publicKeyPem: signer.publicPem,
    });
    let last = 0;
    for (let i = 0; i < 25; i++)
      last = (await c.req('GET', `/api/v1/public/certificats/${FIELDS.number}?c=BBBBBBBBBBBB`))
        .statusCode;
    expect(last).toBe(429);
  });
});
