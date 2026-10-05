/**
 * Suite V1-b — récital de hifẓ (CDC §2.6-6) : séance planifiée, tirage au sort par le serveur dans le carnet,
 * compteurs du barème → note /20, mention et note Coran /15, publication (résultat officiel qui ouvre
 * l'attestation de hifẓ), vue de la famille (ses passages seulement, note après publication). Un test par
 * fonction. Carnet synthétique en1 : socle 114:1-6, 113:1-5, 112:1-4 (aucun texte religieux).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema as t } from '@awform/db';
import { partLabel, recitalResult } from '../src/recital.js';
import { child, join, newClass, parent, setupEdition, teacher, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const ZERO = { aides: 0, hesitations: 0, sauts: 0, oublis: 0, claires: 0, discretes: 0 };
const SOCLE = ['114:1-6', '113:1-5', '112:1-4'];

describe('récital — fonctions pures', () => {
  it('recitalResult : barème du carnet et note Coran /15', () => {
    const r = recitalResult({ ...ZERO, hesitations: 2, claires: 1, fluidite: 4 });
    expect(r).toMatchObject({ total: 18, mention: 'excellent', validation: 'oui', coran15: 13.5 });
    // règle absolue : un verset oublié deux fois → à reprendre
    expect(recitalResult({ ...ZERO, oublis: 2, fluidite: 4 })).toMatchObject({
      mention: 'a_reprendre',
      validation: 'non',
    });
  });
  it('partLabel : nom de la sourate et numéros, jamais le texte', () => {
    expect(partLabel('112:1-4')).toMatch(/\(112:1-4\)$/);
    expect(partLabel('x')).toBe('x');
  });
});

describe.skipIf(!URL_)('récital de hifẓ (awform_test)', () => {
  let c: Ctx;
  let T: Record<string, string>;
  let T2: Record<string, string>;
  let cls: { id: string; joinCode: string };
  let fam: Awaited<ReturnType<typeof parent>>;
  let kid = '';
  let rid = '';
  let appPupil = '';
  let paperPupil = '';
  let entryApp = '';
  let entryPaper = '';

  beforeAll(async () => {
    c = await setupEdition(URL_!);
    T = await teacher(c, 'prof-recital@exemple.org');
    T2 = await teacher(c, 'autre-recital@exemple.org');
    cls = await newClass(c, T, 'Classe récital');
    await c.req('PATCH', `/api/v1/ecole/classes/${cls.id}`, T, {
      levelCode: 'en1',
      schoolName: 'École test',
      place: 'Dakar',
    });
    fam = await parent(c, 'famille-recital@exemple.org');
    kid = await child(c, fam.P, 'Awa');
    await join(c, fam.P, kid, cls);
    const pp = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/pupils`, T, {
      displayName: 'Binta (papier)',
    });
    expect(pp.statusCode, pp.body).toBe(201);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('planifier : carnet du niveau de la classe ; carnet inconnu, autre enseignant → refusés', async () => {
    const r = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/recitals`, T, {
      titre: 'Récital de fin d’année',
      jour: '2026-06-20',
    });
    expect(r.statusCode, r.body).toBe(201);
    rid = r.json().recital.id;
    expect(r.json().recital.bookCode).toBe('en1');
    const bad = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/recitals`, T, {
      titre: 'x',
      jour: '2026-06-20',
      carnet: 'zz9',
    });
    expect(bad.json().error.code).toBe('carnet_inconnu');
    const other = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/recitals`, T2, {
      titre: 'x',
      jour: '2026-06-20',
    });
    expect(other.statusCode).toBe(404);
    // une famille n'a pas accès aux routes de l'enseignant
    const f = await c.req('GET', `/api/v1/ecole/classes/${cls.id}/recitals`, fam.P);
    expect(f.statusCode).toBe(403);
  });

  it('liste : élèves par nom (aucun classement), passages possibles du carnet', async () => {
    const r = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/recitals`, T)).json();
    expect(r.eleves.map((e: { nom: string }) => e.nom)).toEqual(['Awa', 'Binta (papier)']);
    appPupil = r.eleves[0].id;
    paperPupil = r.eleves[1].id;
    expect(r.recitals[0].choixPossibles.map((x: { passage: string }) => x.passage)).toEqual(SOCLE);
  });

  it('tirage : fait par le serveur dans le carnet, gardé, jamais refait', async () => {
    const r = await c.req('POST', `/api/v1/ecole/recitals/${rid}/tirages`, T, {
      pupilId: appPupil,
      parcours: 'socle',
    });
    expect(r.statusCode, r.body).toBe(201);
    const drawn = r.json().passage.tires.map((x: { passage: string }) => x.passage);
    expect([...drawn].sort()).toEqual([...SOCLE].sort());
    expect(r.json().passage.tires[0].libelle).toMatch(/\(\d+:\d+-\d+\)$/);
    entryApp = r.json().passage.id;
    const again = await c.req('POST', `/api/v1/ecole/recitals/${rid}/tirages`, T, {
      pupilId: appPupil,
      parcours: 'renforce',
    });
    expect(again.json().error.code).toBe('deja_tire');
    const p = await c.req('POST', `/api/v1/ecole/recitals/${rid}/tirages`, T, {
      pupilId: paperPupil,
      parcours: 'renforce',
    });
    expect(p.statusCode).toBe(201);
    entryPaper = p.json().passage.id;
    // élève d'une autre classe / autre enseignant
    const stranger = await c.req('POST', `/api/v1/ecole/recitals/${rid}/tirages`, T, {
      pupilId: kid,
      parcours: 'socle',
    });
    expect(stranger.json().error.code).toBe('eleve_introuvable');
    const t2 = await c.req('POST', `/api/v1/ecole/recitals/${rid}/tirages`, T2, {
      pupilId: appPupil,
      parcours: 'socle',
    });
    expect(t2.statusCode).toBe(404);
  });

  it('notes : compteurs → note /20 calculée ; choix hors carnet refusé ; publication incomplète refusée', async () => {
    const put = (eid: string, body: object) =>
      c.req('PUT', `/api/v1/ecole/recitals/${rid}/tirages/${eid}`, T, body);
    const hors = await put(entryApp, { choix: '2:255', compteurs: { ...ZERO, fluidite: 4 } });
    expect(hors.json().error.code).toBe('choix_hors_carnet');
    // tous les passages du socle sont déjà tirés : aucun choix possible en dehors d'eux
    const dup = await put(entryApp, { choix: '112:1-4', compteurs: { ...ZERO, fluidite: 4 } });
    expect(dup.json().error.code).toBe('choix_hors_carnet');
    const ok = await put(entryApp, {
      choix: null,
      compteurs: { ...ZERO, aides: 1, discretes: 1, fluidite: 4 },
      secondJury: true,
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().passage.note).toMatchObject({
      total: 18.5,
      mention: 'excellent',
      coran15: 14,
    });
    expect(ok.json().passage.secondJury).toBe(true);
    const early = await c.req('POST', `/api/v1/ecole/recitals/${rid}/publier`, T);
    expect(early.json().error.code).toBe('notes_manquantes');
    // famille : aucune note avant publication
    const f = (await c.req('GET', `/api/v1/profiles/${kid}/recitals`, fam.P)).json();
    expect(f.recitals[0].passages).toHaveLength(3);
    expect(f.recitals[0].resultat).toBeNull();
    // élève papier : 14/20, « bien » (validé)
    const pap = await put(entryPaper, {
      compteurs: { ...ZERO, aides: 3, claires: 2, fluidite: 3 },
    });
    expect(pap.json().passage.note).toMatchObject({ total: 14, validation: 'oui' });
  });

  it('publication : figée, validations de l’enseignant par passage, attestation de hifẓ ouverte', async () => {
    const r = await c.req('POST', `/api/v1/ecole/recitals/${rid}/publier`, T);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().validations).toBe(6);
    const twice = await c.req('POST', `/api/v1/ecole/recitals/${rid}/publier`, T);
    expect(twice.json().error.code).toBe('recital_publie');
    const edit = await c.req('PUT', `/api/v1/ecole/recitals/${rid}/tirages/${entryApp}`, T, {
      compteurs: { ...ZERO, fluidite: 0 },
    });
    expect(edit.json().error.code).toBe('recital_publie');
    // journal de hifẓ du profil : validations de l'enseignant (source « enseignant »)
    const ev = await c.h.db.select().from(t.hifzEvent).where(eq(t.hifzEvent.profileId, kid));
    expect(
      ev
        .filter((e) => e.source === 'enseignant')
        .map((e) => e.part)
        .sort(),
    ).toEqual([...SOCLE].sort());
    // attestation de hifẓ (lot 13) : éligible pour un passage récité, par l'élève de l'application et l'élève papier
    for (const pid of [appPupil, paperPupil]) {
      const a = await c.req('POST', `/api/v1/ecole/pupils/${pid}/certificats`, T, {
        kind: 'hifz',
        part: '112:1-4',
        apercu: true,
      });
      expect(a.statusCode, a.body).toBe(200);
      expect(a.json().eligible.ok).toBe(true);
    }
  });

  it('famille : ses passages et son résultat après publication ; jamais ceux des autres', async () => {
    const f = (await c.req('GET', `/api/v1/profiles/${kid}/recitals`, fam.P)).json();
    expect(f.recitals).toHaveLength(1);
    expect(f.recitals[0]).toMatchObject({ publie: true, classe: 'Classe récital' });
    expect(f.recitals[0].resultat).toEqual({
      total: 18.5,
      mention: 'excellent',
      validation: 'oui',
      coran15: 14,
    });
    expect(JSON.stringify(f)).not.toContain('Binta');
    const other = await parent(c, 'autre-famille-recital@exemple.org');
    const o = await c.req('GET', `/api/v1/profiles/${kid}/recitals`, other.P);
    expect(o.statusCode).toBe(404);
    const teach = await c.req('GET', `/api/v1/profiles/${kid}/recitals`, T);
    expect(teach.statusCode).toBe(403);
  });

  it('annuler : séance ouverte seulement ; annulée → invisible pour la famille', async () => {
    const pub = await c.req('POST', `/api/v1/ecole/recitals/${rid}/annuler`, T);
    expect(pub.json().error.code).toBe('recital_publie');
    const r2 = (
      await c.req('POST', `/api/v1/ecole/classes/${cls.id}/recitals`, T, {
        titre: 'Séance reportée',
        jour: '2026-06-27',
      })
    ).json().recital.id;
    expect((await c.req('POST', `/api/v1/ecole/recitals/${r2}/annuler`, T)).json().ok).toBe(true);
    const tir = await c.req('POST', `/api/v1/ecole/recitals/${r2}/tirages`, T, {
      pupilId: appPupil,
      parcours: 'socle',
    });
    expect(tir.json().error.code).toBe('recital_annule');
    const f = (await c.req('GET', `/api/v1/profiles/${kid}/recitals`, fam.P)).json();
    expect(f.recitals.map((x: { titre: string }) => x.titre)).toEqual(['Récital de fin d’année']);
  });

  // lot F2 (revue E8) : le profil effacé, la note du récital reste au REGISTRE de l'école, détachée du profil
  it('RGPD : export du compte famille ; profil effacé → note gardée au registre, détachée', async () => {
    const exp = (await c.req('GET', '/api/v1/account/export', fam.P)).json();
    expect(exp.recitalsDeHifz).toHaveLength(1);
    expect(exp.recitalsDeHifz[0]).toMatchObject({ titre: 'Récital de fin d’année' });
    await c.h.db.delete(t.profile).where(eq(t.profile.id, kid));
    const rows = await c.h.db
      .select()
      .from(t.hifzRecitalEntry)
      .where(eq(t.hifzRecitalEntry.id, entryApp));
    expect(rows).toHaveLength(1);
    const [pupil] = await c.h.db
      .select()
      .from(t.classPupil)
      .where(eq(t.classPupil.id, rows[0]!.pupilId));
    expect(pupil?.profileId).toBeNull();
  });
});
