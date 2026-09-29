/**
 * Lot 19 (V1-b) — épreuves notées : session ouverte par l'enseignant (bilan /20, examen /100, niveau de la
 * classe, dates), projection d'épreuve SANS réponse (colonne des « relier » propre à l'élève), une seule copie
 * corrigée par le serveur, partie hors application notée par l'enseignant, textes non préparés réservés à
 * l'enseignant, note visible à la fermeture, remédiation sous 8/20, tableau de suivi, départ de la classe.
 * Contenu : édition SYNTHÉTIQUE (en1 : l03 bilan, l05 examen).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { answerPaths } from '@awform/content';
import { schema as t } from '@awform/db';
import { child, join, newClass, parent, setupEdition, teacher, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
type Obj = Record<string, unknown>;

/** réponses justes pour la projection reçue (le corrigé vient du contenu synthétique, jamais de l'API) */
function perfectAnswers(lesson: Obj, exercises: Array<{ id: string; position: number }>) {
  const exs = lesson.exercices as Obj[];
  const byType: Record<string, (e: Obj) => Obj> = {
    premiere_lettre: () => ({ 0: { choice: 'ب' }, 1: { choice: 'ت' } }),
    chasse: () => ({ 0: { touched: true }, 2: { touched: true }, 5: { touched: true } }),
    ecoute: () => ({ 0: { choice: 'بَابٌ' }, 1: { choice: 'قَلَمٌ' } }),
    vrai_faux: () => ({ 0: { value: true }, 1: { value: false } }),
    complete: () => ({ 0: { choice: 'بَابٌ' } }),
    contient: () => ({ 0: { touched: true }, 2: { touched: true } }),
    ordre: () => ({ 0: { sequence: [1, 0] } }),
    // relier : l'élève associe chaque mot de gauche à la POSITION affichée de sa traduction
    relier: (e) => {
      const droite = e.droite as Array<{ fr: string }>;
      const fr = ['une porte', 'une maison', 'un stylo'];
      return Object.fromEntries(
        fr.map((f, i) => [i, { right: droite.findIndex((d) => d.fr === f) }]),
      );
    },
  };
  const out: Record<string, Obj> = {};
  for (const x of exercises) {
    const e = exs[x.position - 1]!;
    const f = byType[String(e.type)];
    if (f) out[x.id] = f(e);
  }
  return out;
}

describe.skipIf(!URL_)('lot 19 — épreuves notées (awform_test)', () => {
  let c: Ctx;
  let fam: Awaited<ReturnType<typeof parent>>;
  let awa = '';
  let moussa = '';
  let T: Record<string, string>;
  let T2: Record<string, string>;
  let cls: { id: string; joinCode: string };
  let sid = '';
  const soon = () => new Date(Date.now() + 3600_000).toISOString();

  beforeAll(async () => {
    c = await setupEdition(URL_!);
    fam = await parent(c, 'p19@exemple.org');
    awa = await child(c, fam.P, 'Awa');
    moussa = await child(c, fam.P, 'Moussa', 11);
    T = await teacher(c, 'maitre19@ecole.example');
    T2 = await teacher(c, 'autre19@ecole.example');
    cls = await newClass(c, T, 'Classe 19');
    await join(c, fam.P, awa, cls);
    await join(c, fam.P, moussa, cls);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('ouverture : enseignant de la classe, niveau de la classe, bilan ou examen, dates contrôlées', async () => {
    const url = `/api/v1/ecole/classes/${cls.id}/epreuves`;
    const body = { unitId: 'en1.l03', closesAt: soon() };
    expect((await c.req('POST', url, T, body)).json().error.code).toBe('niveau_de_la_classe');
    await c.req('PATCH', `/api/v1/ecole/classes/${cls.id}`, T, { levelCode: 'en1' });
    expect((await c.req('POST', url, T2, body)).statusCode).toBe(404);
    expect((await c.req('POST', url, fam.P, body)).statusCode).toBe(403);
    expect((await c.req('POST', url, T, { ...body, unitId: 'en1.l01' })).json().error.code).toBe(
      'epreuve_invalide',
    );
    expect((await c.req('POST', url, T, { ...body, unitId: 'ad1.l02' })).json().error.code).toBe(
      'niveau_de_la_classe',
    );
    const far = new Date(Date.now() + 40 * 86_400_000).toISOString();
    expect((await c.req('POST', url, T, { ...body, closesAt: far })).json().error.code).toBe(
      'dates_invalides',
    );
    const ok = await c.req('POST', url, T, body);
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json().epreuve).toMatchObject({ bareme: 20 });
    expect(ok.json().epreuve.seed).toBeUndefined();
    sid = ok.json().epreuve.id;
  });

  it('épreuve reçue par l’élève : aucune réponse, rien pour un autre compte', async () => {
    const r = await c.req('GET', `/api/v1/profiles/${awa}/epreuves/${sid}`, fam.P);
    expect(r.statusCode, r.body).toBe(200);
    const { lesson } = r.json();
    expect(answerPaths(lesson)).toEqual([]);
    expect(JSON.stringify(lesson)).not.toContain('seed');
    // texte non préparé : jamais envoyé à l'élève
    expect(JSON.stringify(lesson)).not.toContain('بَابُ الْبَيْتِ');
    const autre = await parent(c, 'autre19@exemple.org');
    expect(
      (await c.req('GET', `/api/v1/profiles/${awa}/epreuves/${sid}`, autre.P)).statusCode,
    ).toBe(404);
    // la colonne de droite des « relier » est propre à chaque élève (même mélange à chaque lecture)
    const again = (await c.req('GET', `/api/v1/profiles/${awa}/epreuves/${sid}`, fam.P)).json();
    const relier = (l: Obj) => (l.exercices as Obj[]).find((e) => e.type === 'relier')!.droite;
    expect(relier(again.lesson)).toEqual(relier(lesson));
  });

  it('copie : code parent, correction par le serveur, une seule copie', async () => {
    const view = (await c.req('GET', `/api/v1/profiles/${awa}/epreuves/${sid}`, fam.P)).json();
    const answers = perfectAnswers(view.lesson, view.exercises);
    const url = `/api/v1/profiles/${awa}/epreuves/${sid}/copie`;
    expect((await c.req('POST', url, fam.P, { answers })).statusCode).toBe(401);
    const ok = await c.req('POST', url, fam.pin, { answers });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json().copie.score).toBeUndefined(); // note montrée à la fermeture seulement
    expect((await c.req('POST', url, fam.pin, { answers: {} })).json().error.code).toBe(
      'copie_deja_envoyee',
    );
    const [row] = await c.h.db.select().from(t.examSubmission);
    expect(row).toMatchObject({ autoPoints: 16, autoMax: 16, score: 20 });
    // Moussa touche toutes les cases de la « chasse » : aucun point de plus
    const all = Object.fromEntries([0, 1, 2, 3, 4, 5].map((k) => [k, { touched: true }]));
    const chasse = view.exercises.find((e: { type: string }) => e.type === 'chasse').id;
    const r2 = await c.req('POST', `/api/v1/profiles/${moussa}/epreuves/${sid}/copie`, fam.pin, {
      answers: { [chasse]: all },
    });
    expect(r2.statusCode).toBe(201);
  });

  it('enseignant : textes non préparés, copies, partie hors application, remédiation', async () => {
    const r = await c.req('GET', `/api/v1/ecole/epreuves/${sid}`, T);
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.textesNonPrepares.lecture.vedette.ar).toBe('بَابُ الْبَيْتِ');
    expect(b.epreuve.seed).toBeUndefined();
    expect(b.aDire[0].mots).toEqual(['بَابٌ', 'قَلَمٌ']);
    const m = b.copies.find((x: { profileId: string }) => x.profileId === moussa);
    expect(m).toMatchObject({ autoPoints: 0, score: 0, remediation: true });
    expect((await c.req('GET', `/api/v1/ecole/epreuves/${sid}`, T2)).statusCode).toBe(404);
    const put = (body: object) =>
      c.req('PUT', `/api/v1/ecole/epreuves/${sid}/copies/${m.id}`, T, body);
    expect((await put({ points: 5, max: 4 })).statusCode).toBe(400);
    expect((await put({ points: 3, max: null })).statusCode).toBe(400);
    // lecture à voix haute notée 4/4 : (0 + 4) / (16 + 4) × 20 = 4 → toujours en remédiation
    expect((await put({ points: 4, max: 4 })).json()).toEqual({ score: 4, remediation: true });
    expect(
      (
        await c.req('PUT', `/api/v1/ecole/epreuves/${sid}/copies/${m.id}`, T2, {
          points: 4,
          max: 4,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('famille : note et leçons à revoir visibles à la fermeture seulement', async () => {
    const before = (await c.req('GET', `/api/v1/profiles/${moussa}/epreuves`, fam.P)).json();
    expect(before.epreuves[0]).toMatchObject({ etat: 'envoyee', score: null, aRevoir: [] });
    expect((await c.req('POST', `/api/v1/ecole/epreuves/${sid}/fermer`, T2)).statusCode).toBe(404);
    expect((await c.req('POST', `/api/v1/ecole/epreuves/${sid}/fermer`, T)).statusCode).toBe(200);
    const after = (await c.req('GET', `/api/v1/profiles/${moussa}/epreuves`, fam.P)).json();
    expect(after.epreuves[0]).toMatchObject({ etat: 'notee', score: 4, remediation: true });
    // le bilan en1.l03 couvre les leçons 1 et 2
    expect(after.epreuves[0].aRevoir.map((x: { id: string }) => x.id)).toEqual([
      'en1.l01',
      'en1.l02',
    ]);
    const awaRes = (await c.req('GET', `/api/v1/profiles/${awa}/epreuves`, fam.P)).json();
    expect(awaRes.epreuves[0]).toMatchObject({ score: 20, remediation: false, aRevoir: [] });
    // session fermée : plus d'épreuve ni de copie
    expect((await c.req('GET', `/api/v1/profiles/${awa}/epreuves/${sid}`, fam.P)).statusCode).toBe(
      404,
    );
  });

  it('tableau de suivi : la note officielle entre dans les bilans (%)', async () => {
    const tb = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/tableau`, T)).json();
    const row = (name: string) =>
      tb.rows.find((r: { pupil: { displayName: string } }) => r.pupil.displayName === name);
    expect(row('Awa').bilans).toEqual([100]);
    expect(row('Moussa').bilans).toEqual([20]);
  });

  it('examen /100 ; quitter la classe efface les copies de cette classe', async () => {
    const ex = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/epreuves`, T, {
      unitId: 'en1.l05',
      closesAt: soon(),
    });
    expect(ex.json().epreuve.bareme).toBe(100);
    expect(
      (await c.req('DELETE', `/api/v1/profiles/${moussa}/classes/${cls.id}`, fam.P)).statusCode,
    ).toBe(200);
    const left = await c.h.db.select().from(t.examSubmission);
    expect(left.every((x) => x.profileId !== moussa)).toBe(true);
    expect(left).toHaveLength(1);
  });
});
