/**
 * Khatma et wird (26/10/2026, interrupteur `khatma_wird`) : coupé par défaut ; plan d'une personne (durée, pages par
 * jour, wird), avancement monotone et position exacte, correction explicite, fin du plan ; khatma de FAMILLE et de CLASSE
 * (parts réparties sans trou ni chevauchement, fin commune, total collectif seulement pour un participant, suivi pour le
 * responsable, « mode serein » sans pourcentage) ; rappel discret (notification à l'heure choisie, une fois par jour,
 * jamais pendant les heures calmes).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  dueNotifications,
  invalidateFlags,
  KHATMA_PAGES,
  repartirKhatma,
  schema as t,
  setClassEvalMode,
} from '@awform/db';
import { adult, child, join, newClass, parent, setup, teacher, type Ctx } from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;
const jour = (n = 0) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('khatma : répartition des parts (pure)', () => {
  it('couvre les 604 pages sans trou ni chevauchement, pour toute taille de groupe', () => {
    for (const n of [1, 2, 3, 7, 10, 29, 30, 31, 45, 100, 604]) {
      const parts = repartirKhatma(n);
      expect(parts).toHaveLength(n);
      let suivante = 1;
      for (const [a, b] of parts) {
        expect(a).toBe(suivante);
        expect(b).toBeGreaterThanOrEqual(a);
        suivante = b + 1;
      }
      expect(suivante).toBe(KHATMA_PAGES + 1);
      const tailles = parts.map(([a, b]) => b - a + 1);
      if (n > 30) expect(Math.max(...tailles) - Math.min(...tailles)).toBeLessThanOrEqual(1);
    }
  });

  it('jusqu’à 30 personnes : des juzʾ entiers (le juzʾ 2 commence à la page 22, le dernier à la page 582)', () => {
    expect(repartirKhatma(30)[1]![0]).toBe(22);
    expect(repartirKhatma(30)[29]).toEqual([582, 604]);
    expect(repartirKhatma(2)).toEqual([
      [1, 301],
      [302, 604],
    ]);
    expect(() => repartirKhatma(0)).toThrow();
    expect(() => repartirKhatma(605)).toThrow();
  });
});

describe.skipIf(!URL)('khatma et wird (API, base de test)', () => {
  let c: Ctx;
  let P: Record<string, string>;
  let A: Record<string, string>;
  let adulte = '';
  let enfants: string[] = [];

  beforeAll(async () => {
    c = await setup(URL!, [{ id: 'l01', n: 1 }]);
    const p = await parent(c, 'khatma.parent@exemple.org');
    P = p.pin;
    enfants = [
      await child(c, p.P, 'Maryam', 9),
      await child(c, p.P, 'Yacine', 12),
      await child(c, p.P, 'Aïcha', 7),
    ];
    const a = await adult(c, 'khatma.adulte@exemple.org');
    A = a.A;
    adulte = a.profileId;
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  const ouvrir = async () => {
    await c.h.db.delete(t.featureFlag).where(eq(t.featureFlag.key, 'khatma_wird'));
    await c.h.db.insert(t.featureFlag).values({ key: 'khatma_wird', state: 'on' });
    invalidateFlags();
  };

  it('coupée par défaut : le serveur refuse (fonction_coupee)', async () => {
    const r = await c.req('GET', `/api/v1/profiles/${adulte}/khatma`, A);
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe('fonction_coupee');
    const w = await c.req('POST', `/api/v1/profiles/${adulte}/khatma`, A, {
      kind: 'wird',
      mode: 'wird',
      startDate: jour(),
      pagesPerDay: 2,
    });
    expect(w.statusCode).toBe(403);
    await ouvrir();
  });

  it('khatma sur une durée : plan, part du compte, reprise exacte, avancement monotone', async () => {
    const cree = await c.req('POST', `/api/v1/profiles/${adulte}/khatma`, A, {
      kind: 'khatma',
      mode: 'duree',
      startDate: jour(),
      endDate: jour(29),
      title: 'Ma khatma',
      seedDone: 12,
      seedSura: 2,
      seedAya: 30,
    });
    expect(cree.statusCode).toBe(201);
    const plan = cree.json().plan;
    expect(plan.part).toMatchObject({ firstPage: 1, lastPage: 604, done: 12, sura: 2, aya: 30 });
    const id = plan.id as string;

    const avance = await c.req('PUT', `/api/v1/profiles/${adulte}/khatma/${id}/progression`, A, {
      done: 20,
      day: jour(),
      sura: 2,
      aya: 60,
    });
    expect(avance.statusCode).toBe(200);
    expect(avance.json().plan.part).toMatchObject({ done: 20, sura: 2, aya: 60 });
    // un autre appareil, en retard, écrit une valeur plus petite : le plus avancé est gardé (la position aussi)
    const retard = await c.req('PUT', `/api/v1/profiles/${adulte}/khatma/${id}/progression`, A, {
      done: 15,
      day: jour(),
      sura: 2,
      aya: 40,
    });
    expect(retard.json().plan.part).toMatchObject({ done: 20, sura: 2, aya: 60 });
    // correction EXPLICITE à la baisse
    const corrige = await c.req('PUT', `/api/v1/profiles/${adulte}/khatma/${id}/progression`, A, {
      done: 18,
      day: jour(),
      sura: 2,
      aya: 55,
      corrige: true,
    });
    expect(corrige.json().plan.part).toMatchObject({ done: 18, sura: 2, aya: 55 });

    const liste = (await c.req('GET', `/api/v1/profiles/${adulte}/khatma`, A)).json();
    expect(liste.plans).toHaveLength(1);
    expect(liste.plans[0]).toMatchObject({
      id,
      title: 'Ma khatma',
      responsable: true,
      groupe: null,
    });
    expect(liste.serein).toBe(false);

    // le jour de départ est fixé à la première écriture du jour : la part du jour ne rétrécit pas pendant qu'on lit
    expect(liste.plans[0].part.doneDayStart).toBe(12);
  });

  it('jour trop éloigné, avancement hors bornes, plan incohérent : refusés', async () => {
    const [plan] = (await c.req('GET', `/api/v1/profiles/${adulte}/khatma`, A)).json().plans;
    const loin = await c.req('PUT', `/api/v1/profiles/${adulte}/khatma/${plan.id}/progression`, A, {
      done: 30,
      day: jour(5),
    });
    expect(loin.statusCode).toBe(400);
    expect(loin.json().error.code).toBe('date_invalide');
    const faux = [
      { kind: 'wird', mode: 'duree', startDate: jour(), endDate: jour(10) },
      { kind: 'khatma', mode: 'duree', startDate: jour() },
      { kind: 'khatma', mode: 'duree', startDate: jour(), endDate: jour(-3) },
      { kind: 'khatma', mode: 'duree', startDate: jour(), endDate: jour(900) },
      { kind: 'khatma', mode: 'pages', startDate: jour() },
    ];
    for (const b of faux) {
      const r = await c.req('POST', `/api/v1/profiles/${adulte}/khatma`, A, b);
      expect(r.statusCode, JSON.stringify(b)).toBe(400);
    }
  });

  it('un autre compte ne voit ni ne modifie le plan (404)', async () => {
    const autre = await adult(c, 'khatma.autre@exemple.org');
    expect((await c.req('GET', `/api/v1/profiles/${adulte}/khatma`, autre.A)).statusCode).toBe(404);
    const [plan] = (await c.req('GET', `/api/v1/profiles/${adulte}/khatma`, A)).json().plans;
    const r = await c.req(
      'PUT',
      `/api/v1/profiles/${autre.profileId}/khatma/${plan.id}/progression`,
      autre.A,
      { done: 100, day: jour() },
    );
    expect(r.statusCode).toBe(404);
  });

  it('plan par pages, prolongation de la fin (pause sans reproche), archivage', async () => {
    const cree = await c.req('POST', `/api/v1/profiles/${enfants[2]}/khatma`, P, {
      kind: 'khatma',
      mode: 'pages',
      startDate: jour(),
      pagesPerDay: 2,
    });
    expect(cree.statusCode).toBe(201);
    const id = cree.json().plan.id as string;
    expect(cree.json().plan.endDate).toBeNull();
    // pas de date de fin à prolonger pour un plan « pages » : seulement le rythme
    const mauvais = await c.req('PATCH', `/api/v1/profiles/${enfants[2]}/khatma/${id}`, P, {
      endDate: jour(100),
    });
    expect(mauvais.statusCode).toBe(400);
    const rythme = await c.req('PATCH', `/api/v1/profiles/${enfants[2]}/khatma/${id}`, P, {
      pagesPerDay: 3,
      reminderHour: 9,
    });
    expect(rythme.json().plan).toMatchObject({ pagesPerDay: 3, reminderHour: 9 });
    // plan sur une durée : la fin se repousse
    const duree = await c.req('POST', `/api/v1/profiles/${enfants[2]}/khatma`, P, {
      kind: 'khatma',
      mode: 'duree',
      startDate: jour(),
      endDate: jour(30),
    });
    const did = duree.json().plan.id as string;
    const prolonge = await c.req('PATCH', `/api/v1/profiles/${enfants[2]}/khatma/${did}`, P, {
      endDate: jour(37),
    });
    expect(prolonge.json().plan.endDate).toBe(jour(37));
    // au plus 3 plans actifs par profil
    const w = { kind: 'wird', mode: 'wird', startDate: jour(), pagesPerDay: 1 };
    expect((await c.req('POST', `/api/v1/profiles/${enfants[2]}/khatma`, P, w)).statusCode).toBe(
      201,
    );
    const trop = await c.req('POST', `/api/v1/profiles/${enfants[2]}/khatma`, P, w);
    expect(trop.statusCode).toBe(409);
    expect(trop.json().error.code).toBe('trop_de_plans');
    // archiver libère la place
    const arch = await c.req('PATCH', `/api/v1/profiles/${enfants[2]}/khatma/${id}`, P, {
      status: 'archivee',
    });
    expect(arch.statusCode).toBe(200);
    const liste = (await c.req('GET', `/api/v1/profiles/${enfants[2]}/khatma`, P)).json();
    expect(liste.plans.map((x: { id: string }) => x.id)).not.toContain(id);
  });

  it('wird : l’avancement se cumule sur plusieurs tours, sans fin', async () => {
    const cree = await c.req('POST', `/api/v1/profiles/${enfants[1]}/khatma`, P, {
      kind: 'wird',
      mode: 'wird',
      startDate: jour(),
      pagesPerDay: 5,
    });
    expect(cree.statusCode).toBe(201);
    const id = cree.json().plan.id as string;
    const r = await c.req('PUT', `/api/v1/profiles/${enfants[1]}/khatma/${id}/progression`, P, {
      done: 700,
      day: jour(),
    });
    expect(r.json().plan.part.done).toBe(700);
    expect(r.json().plan.status).toBe('active');
    // un wird n'a pas de date de fin
    const fin = await c.req('PATCH', `/api/v1/profiles/${enfants[1]}/khatma/${id}`, P, {
      endDate: jour(50),
    });
    expect(fin.statusCode).toBe(400);
  });

  it('khatma terminée quand toutes les pages sont lues ; rouverte si on corrige', async () => {
    const cree = await c.req('POST', `/api/v1/profiles/${enfants[0]}/khatma`, P, {
      kind: 'khatma',
      mode: 'duree',
      startDate: jour(),
      endDate: jour(20),
      seedDone: 600,
    });
    const id = cree.json().plan.id as string;
    const fin = await c.req('PUT', `/api/v1/profiles/${enfants[0]}/khatma/${id}/progression`, P, {
      done: 604,
      day: jour(),
    });
    expect(fin.json().plan).toMatchObject({ status: 'terminee' });
    expect(fin.json().plan.part.finished).toBe(true);
    const rouvre = await c.req(
      'PUT',
      `/api/v1/profiles/${enfants[0]}/khatma/${id}/progression`,
      P,
      {
        done: 590,
        day: jour(),
        corrige: true,
      },
    );
    expect(rouvre.json().plan.status).toBe('active');
  });

  it('khatma en famille : parts réparties, total collectif pour un participant, suivi pour le parent, fin commune', async () => {
    const cree = await c.req('POST', '/api/v1/khatma/famille', P, {
      startDate: jour(),
      endDate: jour(29),
      title: 'En famille',
      profileIds: enfants,
    });
    expect(cree.statusCode).toBe(201);
    expect(cree.json().parts).toBe(3);
    const kid = cree.json().id as string;

    // chaque enfant voit SA part et le total du groupe, jamais la part des autres
    const vue = (await c.req('GET', `/api/v1/profiles/${enfants[0]}/khatma`, P)).json();
    const plan = vue.plans.find((x: { id: string }) => x.id === kid);
    expect(plan.scope).toBe('famille');
    expect(plan.groupe).toEqual({ parts: 3, terminees: 0, pagesLues: 0, pagesTotal: 604 });
    expect(JSON.stringify(plan)).not.toContain('Yacine');

    // le parent (responsable) voit les parts de tous, dans l'ordre du Muṣḥaf
    const suivi = (await c.req('GET', `/api/v1/khatma/${kid}/suivi`, P)).json();
    expect(suivi.membres).toHaveLength(3);
    const pages = suivi.membres.map((m: { firstPage: number; lastPage: number }) => [
      m.firstPage,
      m.lastPage,
    ]);
    expect(pages).toEqual(repartirKhatma(3));
    // un autre compte n'y a pas accès
    const autre = await adult(c, 'khatma.curieux@exemple.org');
    expect((await c.req('GET', `/api/v1/khatma/${kid}/suivi`, autre.A)).statusCode).toBe(404);

    // chacun lit sa part : la khatma ne se termine qu'avec la dernière
    const toutes = pages as Array<[number, number]>;
    for (const [i, id] of enfants.entries()) {
      const [a, b] = toutes[i]!;
      const r = await c.req('PUT', `/api/v1/profiles/${id}/khatma/${kid}/progression`, P, {
        done: b - a + 1,
        day: jour(),
      });
      expect(r.statusCode).toBe(200);
      expect(r.json().plan.status).toBe(i < 2 ? 'active' : 'terminee');
      expect(r.json().plan.groupe.terminees).toBe(i + 1);
    }
    const fin = (await c.req('GET', `/api/v1/khatma/${kid}/suivi`, P)).json();
    expect(fin.status).toBe('terminee');
    expect(fin.groupe).toEqual({ parts: 3, terminees: 3, pagesLues: 604, pagesTotal: 604 });
  });

  it('une famille doit avoir au moins deux profils, tous à elle', async () => {
    const un = await c.req('POST', '/api/v1/khatma/famille', P, {
      startDate: jour(),
      endDate: jour(29),
      profileIds: [enfants[0]],
    });
    expect(un.statusCode).toBe(400);
    const etranger = await c.req('POST', '/api/v1/khatma/famille', P, {
      startDate: jour(),
      endDate: jour(29),
      profileIds: [enfants[0], adulte],
    });
    expect(etranger.statusCode).toBe(404);
  });

  it('khatma de classe : l’enseignant la crée, répartit entre les élèves ; « serein » : aucune part chiffrée', async () => {
    const T = await teacher(c, 'khatma.maitre@exemple.org');
    const cls = await newClass(c, T, 'Classe de lecture');
    const famille = await parent(c, 'khatma.classe@exemple.org');
    const a = await child(c, famille.P, 'Salma', 10);
    const b = await child(c, famille.P, 'Omar', 11);
    await join(c, famille.pin, a, cls);
    await join(c, famille.pin, b, cls);

    const cree = await c.req('POST', `/api/v1/ecole/classes/${cls.id}/khatma`, T, {
      startDate: jour(),
      endDate: jour(40),
    });
    expect(cree.statusCode).toBe(201);
    expect(cree.json().parts).toBe(2);
    const kid = cree.json().id as string;

    // un élève lit sa part
    await c.req('PUT', `/api/v1/profiles/${a}/khatma/${kid}/progression`, famille.pin, {
      done: 100,
      day: jour(),
    });
    const suivi = (await c.req('GET', `/api/v1/khatma/${kid}/suivi`, T)).json();
    expect(suivi.serein).toBe(false);
    expect(suivi.membres.map((m: { done?: number }) => m.done).sort()).toEqual([0, 100]);
    const liste = (await c.req('GET', `/api/v1/ecole/classes/${cls.id}/khatma`, T)).json();
    expect(liste.khatmas[0].groupe.pagesLues).toBe(100);

    // mode serein décidé pour la classe : plus aucune part chiffrée pour l'enseignant
    const me = (await c.req('GET', '/api/v1/auth/me', T)).json();
    await setClassEvalMode(c.h.db, cls.id, 'serein', me.account.id as string);
    const serein = (await c.req('GET', `/api/v1/khatma/${kid}/suivi`, T)).json();
    expect(serein.serein).toBe(true);
    for (const m of serein.membres) expect(m).not.toHaveProperty('done');
    expect(JSON.stringify(serein)).not.toMatch(/classement|rang|rank/i);

    // part confiée à un autre élève de la classe (un élève absent), refusée vers un étranger
    const c3 = await child(c, famille.P, 'Nour', 8);
    await join(c, famille.pin, c3, cls);
    const hors = await c.req('POST', `/api/v1/khatma/${kid}/confier`, T, { de: a, vers: adulte });
    expect(hors.statusCode).toBe(404);
    const ok = await c.req('POST', `/api/v1/khatma/${kid}/confier`, T, { de: a, vers: c3 });
    expect(ok.statusCode).toBe(200);
    const apres = (await c.req('GET', `/api/v1/khatma/${kid}/suivi`, T)).json();
    expect(apres.membres.map((m: { profileId: string }) => m.profileId)).toContain(c3);
    expect(apres.membres.map((m: { profileId: string }) => m.profileId)).not.toContain(a);
    // un parent ne peut pas archiver la khatma de la classe
    expect((await c.req('DELETE', `/api/v1/khatma/${kid}`, famille.P)).statusCode).toBe(404);
    expect((await c.req('DELETE', `/api/v1/khatma/${kid}`, T)).statusCode).toBe(200);
  });

  it('rappel discret : accord du titulaire, heure du plan, une fois par jour, jamais pendant les heures calmes', async () => {
    const tz = 'Europe/Paris';
    const m = await adult(c, 'khatma.rappel@exemple.org');
    const creation = await c.req('POST', `/api/v1/profiles/${m.profileId}/khatma`, m.A, {
      kind: 'wird',
      mode: 'wird',
      startDate: jour(),
      pagesPerDay: 2,
      reminderHour: 12,
    });
    expect(creation.statusCode).toBe(201);
    // sans abonnement ni accord : rien
    const midi = new Date(`${jour()}T10:30:00Z`); // 12 h 30 à Paris l'été, 11 h 30 l'hiver : on cherche l'heure locale
    const heureLocale = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(
        midi,
      ),
    );
    const plan = creation.json().plan.id as string;
    await c.req('PATCH', `/api/v1/profiles/${m.profileId}/khatma/${plan}`, m.A, {
      reminderHour: heureLocale,
    });
    expect(await dueNotifications(c.h.db, midi)).toEqual([]);

    const compte = (await c.req('GET', '/api/v1/auth/me', m.A)).json();
    const accountId = compte.account.id as string;
    await c.h.db.insert(t.pushSubscription).values({
      accountId,
      endpoint: 'https://push.exemple.org/abonnement-1',
      p256dh: 'p'.repeat(40),
      auth: 'a'.repeat(20),
    });
    await c.h.db
      .insert(t.notificationPref)
      .values({ accountId, tz, quietStart: 22, quietEnd: 6 })
      .onConflictDoUpdate({
        target: t.notificationPref.accountId,
        set: { tz, quietStart: 22, quietEnd: 6 },
      });
    // accord du titulaire
    const ok = await c.req('PUT', '/api/v1/khatma/rappel', m.A, { actif: true });
    expect(ok.json()).toEqual({ ok: true, actif: true });
    const dus = await dueNotifications(c.h.db, midi);
    expect(dus).toHaveLength(1);
    expect(dus[0]).toMatchObject({ kind: 'khatma', accountId });
    // texte neutre : ni chiffre, ni nom, ni reproche
    expect(dus[0]!.payload.body).not.toMatch(/\d|retard|manqu|oubli|série/i);
    expect(dus[0]!.payload.url).toBe('/coran');
    // une fois par jour au plus
    await c.h.db
      .update(t.notificationPref)
      .set({ lastKhatma: dus[0]!.day })
      .where(eq(t.notificationPref.accountId, accountId));
    expect(await dueNotifications(c.h.db, midi)).toEqual([]);
    // pas si la part du jour est déjà lue
    await c.h.db
      .update(t.notificationPref)
      .set({ lastKhatma: null })
      .where(eq(t.notificationPref.accountId, accountId));
    await c.req('PUT', `/api/v1/profiles/${m.profileId}/khatma/${plan}/progression`, m.A, {
      done: 2,
      day: jour(),
    });
    expect(await dueNotifications(c.h.db, midi)).toEqual([]);
    // retrait de l'accord : plus rien
    await c.req('PUT', '/api/v1/khatma/rappel', m.A, { actif: false });
    expect(await dueNotifications(c.h.db, midi)).toEqual([]);
    // heures calmes : rien même avec l'accord, à l'heure choisie
    await c.req('PUT', '/api/v1/khatma/rappel', m.A, { actif: true });
    await c.h.db
      .update(t.notificationPref)
      .set({ quietStart: heureLocale, quietEnd: (heureLocale + 9) % 24 })
      .where(eq(t.notificationPref.accountId, accountId));
    await c.h.db.update(t.khatmaPart).set({ done: 0, doneDayStart: 0, dayMark: null });
    expect(await dueNotifications(c.h.db, midi)).toEqual([]);
  });
});
