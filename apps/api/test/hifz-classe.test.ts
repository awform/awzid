/**
 * Hifẓ en classe (25/10/2026, interrupteur `hifz_classe`) : coupé par défaut ; mode DIRECT (erreurs cochées mot par mot, aucun
 * enregistrement, validation dans le journal de hifẓ et la carte des erreurs) ; mode ENREGISTREMENT réservé aux adultes consentants
 * (conservation limitée à 30 jours puis suppression automatique, l'annotation reste sans voix) ; suivi des parents sans audio ;
 * accès réservé au maître de la classe.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  hcCheckSeance,
  hcQualite,
  invalidateFlags,
  purgeExpiredRecitations,
  schema as t,
} from '@awform/db';
import { adult, child, join, newClass, parent, setup, teacher, type Ctx } from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;

describe('hifẓ en classe : règles pures', () => {
  it('portion contrôlée ; direct jamais avec un enregistrement ; enregistrement exige un enregistrement', () => {
    const base = { classId: 'c', profileId: 'p', teacherAccountId: 'm', mode: 'direct' as const };
    expect(hcCheckSeance({ ...base, sura: 112, from: 1, to: 4 })).toBeNull();
    expect(hcCheckSeance({ ...base, sura: 0, from: 1, to: 4 })).toBe('portion_invalide');
    expect(hcCheckSeance({ ...base, sura: 112, from: 3, to: 2 })).toBe('portion_invalide');
    expect(hcCheckSeance({ ...base, sura: 112, from: 1, to: 9 }, new Map([[112, 4]]))).toBe(
      'portion_invalide',
    );
    expect(hcCheckSeance({ ...base, sura: 2, from: 1, to: 80 })).toBe('portion_trop_longue');
    expect(hcCheckSeance({ ...base, sura: 112, from: 1, to: 4, recitationId: 'r' })).toBe(
      'direct_sans_enregistrement',
    );
    expect(hcCheckSeance({ ...base, mode: 'enregistrement', sura: 112, from: 1, to: 4 })).toBe(
      'enregistrement_requis',
    );
  });
  it('résultat du journal : validée sans erreur 3, avec erreurs 2, à reprendre 1 (0 si trois oublis)', () => {
    const z = { oubli: 0, ajout: 0, changement: 0, tajwid: 0 };
    expect(hcQualite('validee', z)).toBe(3);
    expect(hcQualite('validee', { ...z, tajwid: 1 })).toBe(2);
    expect(hcQualite('a_reprendre', { ...z, oubli: 1 })).toBe(1);
    expect(hcQualite('a_reprendre', { ...z, oubli: 3 })).toBe(0);
  });
});

describe.skipIf(!URL)('hifẓ en classe (API, base de test)', () => {
  let c: Ctx;
  let T: Record<string, string>;
  let T2: Record<string, string>;
  let P: Record<string, string>;
  let PIN: Record<string, string>;
  let A: Record<string, string>;
  let cls: { id: string; joinCode: string };
  let enfant = '';
  let adulte = '';
  const jours = (n: number) => new Date(Date.now() + n * 86_400_000);

  beforeAll(async () => {
    c = await setup(URL!, [{ id: 'l01', n: 1 }]);
    T = await teacher(c, 'hc.maitre@exemple.org');
    T2 = await teacher(c, 'hc.autre@exemple.org');
    cls = await newClass(c, T, 'Cercle de hifz');
    const p = await parent(c, 'hc.parent@exemple.org');
    P = p.P;
    PIN = p.pin;
    enfant = await child(c, p.P, 'Maryam', 9);
    await join(c, PIN, enfant, cls);
    const a = await adult(c, 'hc.adulte@exemple.org');
    A = a.A;
    adulte = a.profileId;
    await join(c, A, adulte, cls);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });
  const ouvrir = async () => {
    await c.h.db.delete(t.featureFlag).where(eq(t.featureFlag.key, 'hifz_classe'));
    await c.h.db.insert(t.featureFlag).values({ key: 'hifz_classe', state: 'on' });
    invalidateFlags();
  };

  it('coupée par défaut : le serveur refuse partout (fonction_coupee)', async () => {
    for (const r of [
      await c.req('GET', `/api/v1/ecole/classes/${cls.id}/hifz/eleves`, T),
      await c.req('POST', `/api/v1/ecole/classes/${cls.id}/hifz/seances`, T, {
        profileId: enfant,
        mode: 'direct',
        sura: 112,
        from: 1,
        to: 4,
      }),
      await c.req('GET', `/api/v1/profiles/${adulte}/hifz-classe`, A),
      await c.req('GET', `/api/v1/profiles/${enfant}/hifz-classe/suivi`, P),
    ]) {
      expect(r.statusCode).toBe(403);
      expect(r.json().error.code).toBe('fonction_coupee');
    }
    await ouvrir();
  });

  it('mode direct : le maître coche mot par mot, valide ; journal de hifẓ, carte des erreurs, aucun enregistrement', async () => {
    const liste = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/hifz/eleves`, T)).json();
    expect(liste.eleves.map((e: { id: string }) => e.id).sort()).toEqual([adulte, enfant].sort());
    expect(liste.types).toEqual(['oubli', 'ajout', 'changement', 'tajwid']);

    const cree = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/hifz/seances`, T, {
      profileId: enfant,
      mode: 'direct',
      sura: 112,
      from: 1,
      to: 4,
    });
    expect(cree.statusCode).toBe(201);
    const sid = cree.json().seance.id as string;

    // erreurs hors portion ou hors bornes : refusées
    const hors = await c.req('PUT', `/api/v1/ecole/hifz/seances/${sid}/erreurs`, T, {
      erreurs: [{ a: 7, k: 1, t: 'oubli' }],
    });
    expect(hors.statusCode).toBe(400);
    expect(hors.json().error.code).toBe('erreur_invalide');
    const faux = await c.req('PUT', `/api/v1/ecole/hifz/seances/${sid}/erreurs`, T, {
      erreurs: [{ a: 2, k: 1, t: 'bizarre' }],
    });
    expect(faux.statusCode).toBe(400);

    const erreurs = [
      { a: 2, k: 3, t: 'oubli' },
      { a: 2, k: 3, t: 'tajwid' },
      { a: 3, k: 0, t: 'changement' },
      { a: 3, k: 0, t: 'changement' },
      { a: 4, k: 1, t: 'ajout' },
    ];
    const ok = await c.req('PUT', `/api/v1/ecole/hifz/seances/${sid}/erreurs`, T, { erreurs });
    expect(ok.json().n).toBe(4);
    const relue = (await c.req('GET', `/api/v1/ecole/hifz/seances/${sid}`, T)).json();
    expect(relue.erreurs).toHaveLength(4);
    expect(relue.seance).toMatchObject({ mode: 'direct', status: 'en_cours', recitationId: null });

    const fin = await c.req('POST', `/api/v1/ecole/hifz/seances/${sid}/terminer`, T, {
      issue: 'validee',
      remarque: 'Bien, reprendre le tajwīd du verset 2.',
    });
    expect(fin.statusCode).toBe(200);
    expect(fin.json()).toMatchObject({
      q: 2,
      erreurs: { oubli: 1, ajout: 1, changement: 1, tajwid: 1 },
    });
    // une séance terminée ne se modifie plus
    expect(
      (await c.req('PUT', `/api/v1/ecole/hifz/seances/${sid}/erreurs`, T, { erreurs: [] }))
        .statusCode,
    ).toBe(409);
    expect(
      (await c.req('POST', `/api/v1/ecole/hifz/seances/${sid}/terminer`, T, { issue: 'validee' }))
        .statusCode,
    ).toBe(409);

    // journal de hifẓ : événement « enseignant » ; carte des erreurs : marques mot par mot, « juste » sur le verset sans erreur
    const hz = (await c.req('GET', `/api/v1/hifz/profiles/${enfant}`, P)).json();
    const ev = hz.events.find((e: { part: string }) => e.part === '112:1-4');
    expect(ev).toMatchObject({ kind: 'revision', q: 2, source: 'enseignant' });
    const marques = (await c.req('GET', `/api/v1/hifz/profiles/${enfant}/marques`, P)).json()
      .marques;
    const enseignant = marques.filter((m: { src: string }) => m.src === 'enseignant');
    expect(
      enseignant.map((m: { a: number; k: number; t: string }) => `${m.a}:${m.k}:${m.t}`).sort(),
    ).toEqual(['1:-1:juste', '2:3:erreur', '2:3:oubli', '3:0:erreur', '4:1:erreur'].sort());

    // JAMAIS d'enregistrement en mode direct (contrainte de la base)
    expect((await c.h.pool.query('select count(*)::int n from recitation_upload')).rows[0].n).toBe(
      0,
    );
  });

  it('le suivi des parents : portion, issue, erreurs par type, remarque ; jamais d’audio ; réservé à la famille', async () => {
    const s = (await c.req('GET', `/api/v1/profiles/${enfant}/hifz-classe/suivi`, P)).json()
      .seances;
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      mode: 'direct',
      sura: 112,
      from: 1,
      to: 4,
      outcome: 'validee',
      remark: 'Bien, reprendre le tajwīd du verset 2.',
      erreurs: { oubli: 1, ajout: 1, changement: 1, tajwid: 1 },
    });
    expect(JSON.stringify(s)).not.toMatch(/ciphertext|audio|iv"/);
    // les séances en cours ne sont pas montrées ; un autre compte n'y a pas accès
    const autre = await adult(c, 'hc.curieux@exemple.org');
    expect(
      (await c.req('GET', `/api/v1/profiles/${enfant}/hifz-classe/suivi`, autre.A)).statusCode,
    ).toBe(404);
    // le maître ne passe pas par la porte des familles
    expect(
      (await c.req('GET', `/api/v1/profiles/${enfant}/hifz-classe/suivi`, T)).statusCode,
    ).toBeGreaterThanOrEqual(403);
  });

  it('accès réservé au maître de la classe (second facteur) : ni autre maître, ni famille', async () => {
    expect((await c.req('GET', `/api/v1/ecole/classes/${cls.id}/hifz/eleves`, T2)).statusCode).toBe(
      404,
    );
    expect((await c.req('GET', `/api/v1/ecole/classes/${cls.id}/hifz/eleves`, P)).statusCode).toBe(
      403,
    );
    const sid = (
      await c.req('POST', `/api/v1/ecole/classes/${cls.id}/hifz/seances`, T, {
        profileId: enfant,
        mode: 'direct',
        sura: 1,
        from: 1,
        to: 3,
      })
    ).json().seance.id as string;
    expect((await c.req('GET', `/api/v1/ecole/hifz/seances/${sid}`, T2)).statusCode).toBe(404);
    expect(
      (await c.req('POST', `/api/v1/ecole/hifz/seances/${sid}/terminer`, T2, { issue: 'validee' }))
        .statusCode,
    ).toBe(404);
    // élève inconnu de la classe
    const etranger = await child(c, P, 'Yacine', 11);
    const r = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/hifz/seances`, T, {
      profileId: etranger,
      mode: 'direct',
      sura: 1,
      from: 1,
      to: 3,
    });
    expect(r.statusCode).toBe(404);
    // « à reprendre » : issue 1, aucune marque « juste »
    const fin = await c.req('POST', `/api/v1/ecole/hifz/seances/${sid}/terminer`, T, {
      issue: 'a_reprendre',
    });
    expect(fin.json().q).toBe(1);
  });

  it('mode enregistrement : adultes consentants seulement ; conservation ≤ 30 jours puis suppression automatique ; annotation sans voix', async () => {
    const audio = Buffer.from('RIFF-essai-pas-une-voix');
    const post = (cookies: Record<string, string>, id: string, q: string) =>
      c.req(
        'POST',
        `/api/v1/profiles/${id}/hifz-classe/enregistrements?${q}`,
        { ...cookies, 'content-type': 'audio/webm' },
        audio,
      );
    const q = `classe=${cls.id}&passage=112:1-4&duree=20`;
    // jamais la voix d'un enfant
    const e = await post(PIN, enfant, q);
    expect(e.statusCode).toBe(403);
    expect(e.json().error.code).toBe('enregistrement_adultes_seulement');
    // l'adulte doit d'abord consentir
    const sans = await post(A, adulte, q);
    expect(sans.statusCode).toBe(409);
    expect(sans.json().error.code).toBe('accord_requis');
    expect(
      (await c.req('POST', `/api/v1/profiles/${adulte}/recitations/accord`, A, {})).statusCode,
    ).toBe(200);
    // durée de la classe plafonnée à 30 jours
    await c.h.pool.query('update class_group set recitation_days = 30 where id = $1', [cls.id]);
    const ok = await post(A, adulte, q);
    expect(ok.statusCode).toBe(201);
    expect(ok.json().jours).toBe(30);
    const rid = ok.json().recitation.id as string;
    const exp = new Date(ok.json().recitation.expiresAt);
    expect(exp.getTime() - Date.now()).toBeLessThanOrEqual(30 * 86_400_000 + 5000);
    expect(exp.getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);
    // la fiche de l'élève : durée maximale annoncée, classes, accord
    const info = (await c.req('GET', `/api/v1/profiles/${adulte}/hifz-classe`, A)).json();
    expect(info).toMatchObject({ adulte: true, accord: true, conservationMaxJours: 30 });
    expect(info.classes[0].jours).toBe(30);
    expect(info.enregistrements).toHaveLength(1);
    // le maître voit l'enregistrement de l'adulte (jamais celui d'un enfant), l'annote, valide
    const liste = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/hifz/eleves`, T)).json();
    expect(liste.enregistrements.map((r: { id: string }) => r.id)).toEqual([rid]);
    const refus = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/hifz/seances`, T, {
      profileId: enfant,
      mode: 'enregistrement',
      recitationId: rid,
      sura: 112,
      from: 1,
      to: 4,
    });
    expect(refus.statusCode).toBe(403);
    const cree = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/hifz/seances`, T, {
      profileId: adulte,
      mode: 'enregistrement',
      recitationId: rid,
      sura: 112,
      from: 1,
      to: 4,
    });
    expect(cree.statusCode).toBe(201);
    const sid = cree.json().seance.id as string;
    await c.req('PUT', `/api/v1/ecole/hifz/seances/${sid}/erreurs`, T, {
      erreurs: [{ a: 1, k: 2, t: 'tajwid' }],
    });
    expect(
      (
        await c.req('POST', `/api/v1/ecole/hifz/seances/${sid}/terminer`, T, { issue: 'validee' })
      ).json().q,
    ).toBe(2);
    // JAMAIS de lien entre une séance « direct » et un enregistrement (contrainte de la base)
    const direct = (
      await c.req('POST', `/api/v1/ecole/classes/${cls.id}/hifz/seances`, T, {
        profileId: adulte,
        mode: 'direct',
        sura: 112,
        from: 1,
        to: 2,
      })
    ).json().seance.id as string;
    await expect(
      c.h.pool.query('update hifz_classe_seance set recitation_id = $1 where id = $2', [
        rid,
        direct,
      ]),
    ).rejects.toThrow(/hifz_classe_seance_direct/);
    // suppression automatique à l'échéance : la voix disparaît, l'annotation reste (sans audio)
    expect(await purgeExpiredRecitations(c.h.db, jours(31))).toBe(1);
    const apres = (
      await c.h.pool.query('select recitation_id from hifz_classe_seance where id = $1', [sid])
    ).rows[0];
    expect(apres.recitation_id).toBeNull();
    expect(
      (
        await c.h.pool.query(
          'select count(*)::int n from hifz_classe_erreur where seance_id = $1',
          [sid],
        )
      ).rows[0].n,
    ).toBe(1);
    expect((await c.h.pool.query('select count(*)::int n from recitation_upload')).rows[0].n).toBe(
      0,
    );
    // l'élève peut aussi supprimer son enregistrement à tout moment (porte existante du lot 16)
    expect((await post(A, adulte, q)).statusCode).toBe(201);
    const mes = (await c.req('GET', `/api/v1/profiles/${adulte}/recitations`, A)).json()
      .recitations;
    expect(
      (await c.req('DELETE', `/api/v1/profiles/${adulte}/recitations/${mes[0].id}`, A)).statusCode,
    ).toBe(200);
  });
});
