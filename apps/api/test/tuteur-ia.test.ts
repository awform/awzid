/**
 * Tuteur IA de CONVERSATION (19/10/2026, TUTEUR_IA.md) — tout en mode SIMULÉ, aucun appel réel :
 * étage 1 (dialogue guidé : texte, voix avec accord, écoute factice), étage 2 (conversation libre) : accord
 * parental OBLIGATOIRE avant tout appel, enfants et niveau 1 exclus, refus religieux sans appel au modèle (texte)
 * ou après transcription (voix), plafonds (élève, jour, mois) avec réservation du pire cas, seuils d'alerte,
 * disjoncteur, journal minimal, Vertex bloqué sans réglages.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  connect,
  parseRecitationKey,
  resetTestDatabase,
  runMigrations,
  schema as t,
  type DbHandle,
} from '@awform/db';
import {
  ConversationSimulee,
  SyntheseSimulee,
  tarifDe,
  type ConvEntree,
  type ConvFournisseur,
  type ConvSetup,
} from '@awform/tutor';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { ClientEcoute } from '../src/ecoute-ia.js';
import { cookieOf, PW, YEAR } from './helpers.js';

const URL = process.env.TEST_DATABASE_URL;

/** Fournisseur ESPION : compte les appels, répond comme le simulé ou selon `prochain`. */
class Espion implements ConvFournisseur {
  readonly name = 'simule';
  readonly real = false;
  readonly modele = 'gemini-3.8-flash';
  appels = 0;
  prochain: object | null = null;
  /** 20/10/2026 : panne du fournisseur, telle que la batterie réelle l'a vue (Vertex : HTTP 400) */
  panne = false;
  private readonly sim = new ConversationSimulee();
  async repondre(s: string, e: ConvEntree) {
    this.appels++;
    if (this.panne) {
      this.panne = false;
      return {
        status: 'erreur' as const,
        brouillon: null,
        usage: { texte: 0, audio: 0, sortie: 0 },
        detail: 'api_400',
        message: 'INVALID_ARGUMENT : Request contains an invalid argument.',
      };
    }
    if (this.prochain) {
      const b = this.prochain;
      this.prochain = null;
      return {
        status: 'ok' as const,
        brouillon: b,
        usage: { texte: 3000, audio: 100, sortie: 200 },
      };
    }
    return this.sim.repondre(s, e);
  }
}

const DIALOGUE = {
  v: 1,
  niveau: 'ad2',
  lecon: 'l01',
  titre_fr: 'Au marché',
  scene: { lieu: 'marche' },
  role: { qui: 'Ali' },
  tours: [
    { t: 'partenaire', qui: 'Le vendeur', ar: 'مَاذَا تُرِيدُ؟', fr: 'Que veux-tu ?' },
    {
      t: 'eleve',
      qui: 'Ali',
      choix: [
        { ar: 'أُرِيدُ تُفَّاحًا.', fr: 'Je veux des pommes.', kind: 'bonne', src: 'ad2.l01#1' },
        { ar: 'هٰذَا سُوقٌ.', kind: 'presque', src: 'ad2.l01#2' },
      ],
    },
    {
      t: 'partenaire',
      qui: 'Le vendeur',
      ar: 'هٰذَا تُفَّاحٌ جَمِيلٌ.',
      fr: 'Voici de belles pommes.',
    },
  ],
  mots: [],
};

describe.skipIf(!URL)('tuteur IA de conversation (simulé)', () => {
  let h: DbHandle;
  let app: FastifyInstance;
  let bloque: FastifyInstance;
  const espion = new Espion();
  const entendus: string[] = [];
  const ecoute: ClientEcoute = {
    ecouter: async () => ({
      mots: entendus.map((w) => ({ w, conf: 0.9, t0: 0, t1: 1 })),
      voix: [],
      duree: 2,
      calcul: 0.5,
    }),
    direct: async () => ({ erreur: 'non', statut: 503 }),
    finDirect: async () => {},
    sante: async () => true,
  };
  const env: NodeJS.ProcessEnv = {
    AWFORM_TUTEUR_PLAFOND_MOIS: '1',
    AWFORM_TUTEUR_PLAFOND_JOUR: '1',
    AWFORM_TUTEUR_REQUETES_JOUR: '40',
  };
  let A: Record<string, string> = {};
  let adulte = '';
  let P: Record<string, string> = {};
  let ado = '';
  let enfant = '';

  const req = (
    a: FastifyInstance,
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    headers: Record<string, string>,
    payload?: object,
  ) =>
    a.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { ...(method !== 'GET' ? { 'x-awform': '1' } : {}), ...headers },
    });
  const libre = (profil: string, H: Record<string, string>, body: object, a = app) =>
    req(a, 'POST', `/api/v1/tuteur-ia/${profil}/libre`, H, { unitId: 'ad2.l01', ...body });
  const depenses = () => h.db.select().from(t.tutorSpend);

  beforeAll(async () => {
    h = connect(URL!, 4);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    const dir = mkdtempSync(join(tmpdir(), 'conv-'));
    for (const [lv, d] of [
      ['ad2', DIALOGUE],
      ['ad1', { ...DIALOGUE, niveau: 'ad1' }],
      ['ado2', { ...DIALOGUE, niveau: 'ado2' }],
      ['en2', { ...DIALOGUE, niveau: 'en2' }],
    ] as const) {
      mkdirSync(join(dir, lv), { recursive: true });
      writeFileSync(join(dir, lv, 'l01.json'), JSON.stringify(d));
    }
    process.env.AWFORM_CONVERSATION_DIR = dir;
    const [ed] = await h.db
      .insert(t.edition)
      .values({ code: 'test', status: 'publiee', sourceSha256: 'test', publishedAt: new Date() })
      .returning({ id: t.edition.id });
    for (const [code, track, rank] of [
      ['ad1', 'adultes', 1],
      ['ad2', 'adultes', 2],
      ['ado2', 'ados', 2],
      ['en2', 'enfants', 2],
    ] as const) {
      await h.pool.query(
        'insert into level (code, track, rank, title_fr) values ($1, $2, $3, $4)',
        [code, track, rank, code],
      );
      const id = `${code}.l01`;
      await h.db.insert(t.unit).values({ id, levelCode: code, n: 1, kind: 'lecon' });
      const lesson = {
        n: 1,
        type: 'lecon',
        exercices: [],
        mots: [
          { ar: 'تُفَّاحٌ', fr: 'pomme' },
          { ar: 'سُوقٌ', fr: 'marché' },
        ],
      };
      await h.db.insert(t.unitVersion).values({
        editionId: ed!.id,
        unitId: id,
        numLecon: 1,
        titleAr: 'فِي السُّوقِ',
        titleFr: 'Au marché',
        sha256: id,
        strictJson: true,
        content: lesson,
        student: lesson,
      });
    }
    // F5 : la fonction est en essai (canal bêta) ; ouverte pour ces tests
    await h.db.insert(t.featureFlag).values({ key: 'tuteur_ia', state: 'on' });
    const setup: ConvSetup = {
      mode: 'simule',
      fournisseur: espion,
      synthese: new SyntheseSimulee(),
      modele: 'gemini-3.8-flash',
      tarif: tarifDe('gemini-3.8-flash'),
    };
    const base = {
      db: h.db,
      secretKey: randomBytes(32),
      recitationKey: parseRecitationKey(`v1:${randomBytes(32).toString('hex')}`),
      messageKey: parseRecitationKey(`v1:${randomBytes(32).toString('hex')}`),
      relaisCertsDir: null,
    };
    app = buildApp({ ...base, tuteurIa: { setup, ecoute, env } });
    // « vertex » demandé sans projet ni contrôle : étage 2 bloqué, sans aucun appel réseau
    bloque = buildApp({ ...base, tuteurIa: { env: { AWFORM_TUTEUR: 'vertex' }, ecoute } });
    await app.ready();
    await bloque.ready();

    const su = await req(
      app,
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'adulte',
        email: 'adulte.tuia@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu', 'donnee_religieuse_art9'],
        birthYear: YEAR - 30,
      },
    );
    A = { cookie: cookieOf(su) };
    adulte = (await req(app, 'GET', '/api/v1/auth/me', A, undefined)).json().profiles[0].id;
    const sp = await req(
      app,
      'POST',
      '/api/v1/auth/signup',
      {},
      {
        kind: 'parent',
        birthYear: 1985,
        email: 'parent.tuia@exemple.org',
        password: PW,
        country: 'FR',
        consents: ['cgu', 'donnee_religieuse_art9'],
      },
    );
    P = { cookie: cookieOf(sp) };
    await req(app, 'POST', '/api/v1/account/pin', P, { pin: '4821', password: PW });
    const mk = async (pseudonym: string, age: number, levelCode: string) => {
      const r = await req(app, 'POST', '/api/v1/profiles', P, {
        pseudonym,
        birthYear: YEAR - age,
        levelCode,
        password: PW,
        consents: ['compte_suivi', 'donnee_religieuse_art9'],
      });
      if (r.statusCode !== 201) throw new Error(r.body);
      return r.json().id as string;
    };
    ado = await mk('Sami', 15, 'ado2');
    enfant = await mk('Lina', 9, 'en2');
  });
  afterAll(async () => {
    await app?.close();
    await bloque?.close();
    await h?.pool.end();
  });

  it('état : adulte → conversation libre ouverte ; enfant → guidée seule ; ado sans accord → accord parental', async () => {
    const a = (await req(app, 'GET', `/api/v1/tuteur-ia/${adulte}/etat?unit=ad2.l01`, A)).json();
    expect(a).toMatchObject({
      actif: true,
      audience: 'adulte',
      libre: { disponible: true, simule: true, voix: true },
    });
    expect(a.minutesRestantes).toBe(20);
    const e = (await req(app, 'GET', `/api/v1/tuteur-ia/${enfant}/etat?unit=en2.l01`, P)).json();
    expect(e.libre).toMatchObject({ disponible: false, raison: 'enfant' });
    const o = (await req(app, 'GET', `/api/v1/tuteur-ia/${ado}/etat?unit=ado2.l01`, P)).json();
    expect(o.libre).toMatchObject({ disponible: false, raison: 'accord_parental' });
  });

  it('étage 2, texte : réponse tirée du dialogue, voix simulée, dépense soldée, journal sans la phrase de l’adulte', async () => {
    const avant = espion.appels;
    const r = await libre(adulte, A, { texte: 'أريد تفاحا' });
    expect(r.statusCode, r.body).toBe(200);
    const j = r.json();
    expect(j.reponse_ar).toBe('هٰذَا تُفَّاحٌ جَمِيلٌ.');
    expect(j.reponse_fr).toBe('Voici de belles pommes.');
    expect(j).toMatchObject({ lu: true, simule: true, repli: false });
    expect(j.audio.mime).toBe('audio/wav');
    expect(espion.appels).toBe(avant + 1);
    const d = await depenses();
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ statut: 'fait', profileId: adulte });
    expect(d[0]!.costMicros).toBeGreaterThan(0);
    const [log] = await h.db.select().from(t.tutorLog).where(eq(t.tutorLog.id, j.logId));
    expect(log).toMatchObject({
      roleId: 'tuteur_conversation',
      question: null,
      route: 'conversation',
      action: 'libre_texte',
    });
  });

  it('question RELIGIEUSE écrite : renvoi, AUCUN appel au modèle, aucune dépense', async () => {
    const avant = espion.appels;
    const n = (await depenses()).length;
    for (const q of [
      'Est-ce que la musique est haram ?',
      'ما حكم الصلاة في البيت؟',
      'Explique-moi le tafsir de la sourate',
    ]) {
      const r = await libre(adulte, A, { texte: q });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toMatchObject({ redirection: 'religion', reponse_ar: '', audio: null });
    }
    expect(espion.appels).toBe(avant);
    expect(await depenses()).toHaveLength(n);
  });

  it('question religieuse DITE (voix) : la réponse du modèle n’est pas montrée, renvoi', async () => {
    espion.prochain = {
      transcription_ar: 'مَا حُكْمُ الصَّلَاةِ؟',
      reponse_ar: 'هٰذَا سُوقٌ.',
      reponse_fr: 'C’est un marché.',
      correction: null,
      sujet: 'langue',
    };
    const r = await libre(adulte, A, {
      audio: {
        mime: 'audio/webm;codecs=opus',
        b64: Buffer.from('xx').toString('base64'),
        secondes: 3,
      },
    });
    expect(r.json()).toMatchObject({ redirection: 'religion', reponse_ar: '' });
  });

  it('20/10 : politique, contenu inconvenant, conseil — refus poli AVANT l’appel, aucune dépense', async () => {
    const avant = espion.appels;
    const n = (await depenses()).length;
    for (const [q, c] of [
      ['Que penses-tu des élections présidentielles ?', 'politique'],
      ['مَا رَأْيُكَ فِي الْحَرْبِ؟', 'politique'],
      ['Où acheter de l’alcool ?', 'inconvenant'],
      ['Quel médicament dois-je prendre ?', 'conseil'],
      ['أُرِيدُ اسْتِثْمَارَ مَالِي فِي الْبُورْصَةِ', 'conseil'],
    ]) {
      const r = await libre(adulte, A, { texte: q! });
      expect(r.statusCode).toBe(200);
      expect(r.json(), q).toMatchObject({ redirection: c, reponse_ar: '', audio: null });
    }
    expect(espion.appels).toBe(avant);
    expect(await depenses()).toHaveLength(n);
  });

  it('20/10 : sujet sensible DIT (voix) ou réponse du modèle qui en parle → renvoi ou repli, jamais montré', async () => {
    const voix = {
      audio: { mime: 'audio/webm', b64: Buffer.from('xx').toString('base64'), secondes: 3 },
    };
    espion.prochain = {
      transcription_ar: 'أَيْنَ أَشْتَرِي الْخَمْرَ؟',
      reponse_ar: 'هٰذَا سُوقٌ.',
      reponse_fr: 'C’est un marché.',
      correction: null,
      sujet: 'langue',
    };
    expect((await libre(adulte, A, voix)).json()).toMatchObject({
      redirection: 'inconvenant',
      reponse_ar: '',
    });
    espion.prochain = {
      transcription_ar: '',
      reponse_ar: 'هٰذَا سُوقٌ.',
      reponse_fr: 'Prenez du paracétamol.',
      correction: null,
      sujet: 'langue',
    };
    const r = await libre(adulte, A, { texte: 'هٰذَا سُوقٌ' });
    expect(r.json().repli).toBe(true);
    expect(r.json().reponse_fr).not.toContain('paracétamol');
  });

  it('20/10 : rencontre avec un inconnu d’internet (français, arabe) → protection AVANT l’appel, alerte « rencontre »', async () => {
    const avant = espion.appels;
    const n = (await depenses()).length;
    for (const q of [
      'Quelqu’un sur internet veut me rencontrer seule ce soir.',
      'شَخْصٌ مِنَ الْإِنْتَرْنِتِ يُرِيدُ أَنْ يُقَابِلَنِي وَحْدِي اللَّيْلَةَ.',
      'Un inconnu du jeu en ligne m’a donné rendez-vous samedi.',
    ]) {
      const r = await libre(adulte, A, { texte: q });
      expect(r.statusCode).toBe(200);
      expect(r.json(), q).toMatchObject({
        redirection: 'protection',
        protection: 'rencontre',
        reponse_ar: '',
        audio: null,
      });
      expect(r.json().aide).toContain('119');
    }
    // la détresse garde son motif
    expect(
      (await libre(adulte, A, { texte: 'Mon père me frappe tous les soirs.' })).json(),
    ).toMatchObject({ redirection: 'protection', protection: 'detresse' });
    expect(espion.appels).toBe(avant);
    expect(await depenses()).toHaveLength(n);
    const alertes = await h.db
      .select({ motif: t.tutorAlert.motif })
      .from(t.tutorAlert)
      .where(eq(t.tutorAlert.profileId, adulte));
    expect(alertes.filter((a) => a.motif === 'rencontre')).toHaveLength(3);
    expect(alertes.some((a) => a.motif === 'detresse')).toBe(true);
  });

  it('20/10 : panne du fournisseur (HTTP 400) → repli sur le livre, aucun jeton compté, aucune réponse inventée', async () => {
    espion.panne = true;
    const r = await libre(adulte, A, { texte: 'أريد تفاحا' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      repli: true,
      reponse_ar: 'مَاذَا تُرِيدُ؟',
      correction: null,
    });
    const [log] = await h.db.select().from(t.tutorLog).where(eq(t.tutorLog.id, r.json().logId));
    expect(log).toMatchObject({ route: 'conversation_repli' });
    // seule la voix de la réplique du livre est comptée (quelques dizaines de µ€), aucun jeton du modèle
    expect(log!.costMicros).toBeLessThan(100);
    expect(JSON.stringify(log!.filter)).toContain('api_400');
  });

  it('enfant : étage 2 refusé AVANT tout appel ; niveau 1 refusé', async () => {
    const avant = espion.appels;
    expect(
      (
        await req(app, 'POST', `/api/v1/tuteur-ia/${enfant}/libre`, P, {
          unitId: 'en2.l01',
          texte: 'سلام',
        })
      ).json().error.code,
    ).toBe('reserve_ados_adultes');
    expect(
      (
        await req(app, 'POST', `/api/v1/tuteur-ia/${adulte}/libre`, A, {
          unitId: 'ad1.l01',
          texte: 'سلام',
        })
      ).json().error.code,
    ).toBe('niveau_1');
    expect(espion.appels).toBe(avant);
  });

  it('ado : accord parental « tuteur_ia » OBLIGATOIRE avant tout appel, puis journal visible du parent', async () => {
    const avant = espion.appels;
    const r = await req(app, 'POST', `/api/v1/tuteur-ia/${ado}/libre`, P, {
      unitId: 'ado2.l01',
      texte: 'أريد تفاحا',
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe('accord_parental_requis');
    expect(espion.appels).toBe(avant);
    const ok = await req(
      app,
      'PUT',
      `/api/v1/profiles/${ado}/tuteur`,
      { ...P, 'x-parent-pin': '4821' },
      { actif: true },
    );
    expect(ok.statusCode, ok.body).toBe(200);
    const r2 = await req(app, 'POST', `/api/v1/tuteur-ia/${ado}/libre`, P, {
      unitId: 'ado2.l01',
      texte: 'أريد تفاحا',
    });
    expect(r2.statusCode, r2.body).toBe(200);
    const [log] = await h.db.select().from(t.tutorLog).where(eq(t.tutorLog.id, r2.json().logId));
    expect(log!.question).toBe('أريد تفاحا');
    const jr = (await req(app, 'GET', `/api/v1/tutor/${ado}/journal`, P)).json();
    expect(jr.journal.some((x: { id: string }) => x.id === r2.json().logId)).toBe(true);
  });

  it('plafonds : échanges de l’élève, puis plafond du MOIS (pire cas réservé) — coupure sans appel', async () => {
    await h.db.delete(t.tutorSpend);
    await h.db.insert(t.tutorSpend).values(
      Array.from({ length: 40 }, () => ({
        profileId: adulte,
        costMicros: 0,
        statut: 'fait',
        fournisseur: 'simule',
        secondes: 10,
      })),
    );
    const avant = espion.appels;
    let r = await libre(adulte, A, { texte: 'أريد تفاحا' });
    expect(r.statusCode).toBe(429);
    expect(r.json().error).toMatchObject({ code: 'plafond', refus: 'eleve_requetes' });
    await h.db.delete(t.tutorSpend);
    // 0,995 € déjà dépensés sur 1 € : le pire cas d'un tour (≈ 1,2 centime) ne tient plus
    await h.db
      .insert(t.tutorSpend)
      .values({ profileId: null, costMicros: 995_000, statut: 'fait', fournisseur: 'simule' });
    r = await libre(adulte, A, { texte: 'أريد تفاحا' });
    expect(r.json().error).toMatchObject({ code: 'plafond', refus: 'plafond_mois' });
    expect(espion.appels).toBe(avant);
    // la dépense « vertex » (réelle) ne se mêle pas à la simulée
    await h.db.delete(t.tutorSpend);
    await h.db
      .insert(t.tutorSpend)
      .values({ profileId: null, costMicros: 995_000, statut: 'fait', fournisseur: 'vertex' });
    expect((await libre(adulte, A, { texte: 'أريد تفاحا' })).statusCode).toBe(200);
  });

  it('seuils d’alerte 50 % : franchis une seule fois par mois', async () => {
    await h.db.delete(t.tutorSpend);
    await h.db
      .insert(t.tutorSpend)
      .values({ profileId: null, costMicros: 499_000, statut: 'fait', fournisseur: 'simule' });
    expect((await libre(adulte, A, { texte: 'أريد تفاحا' })).statusCode).toBe(200);
    expect((await libre(adulte, A, { texte: 'أريد تفاحا' })).statusCode).toBe(200);
    const al = await h.db.select().from(t.tutorBudgetAlert);
    expect(al.map((x) => x.seuil)).toEqual([50]);
  });

  it('disjoncteur AWFORM_COUTS_COUPES : étage 2 coupé', async () => {
    process.env.AWFORM_COUTS_COUPES = '1';
    try {
      expect((await libre(adulte, A, { texte: 'أريد تفاحا' })).json().error.code).toBe(
        'couts_coupes',
      );
    } finally {
      delete process.env.AWFORM_COUTS_COUPES;
    }
  });

  it('étage 1 : texte comparé à la réplique du livre ; voix seulement avec l’accord « analyse vocale »', async () => {
    const g = (body: object) =>
      req(app, 'POST', `/api/v1/tuteur-ia/${adulte}/guidee`, A, {
        unitId: 'ad2.l01',
        tour: 1,
        ...body,
      });
    expect((await g({ texte: 'أريد تفاحا' })).json()).toMatchObject({
      bilan: 'bravo',
      attendue: 'أُرِيدُ تُفَّاحًا.',
    });
    expect((await g({ tour: 0, texte: 'x' })).json().error.code).toBe('tour_invalide');
    const audio = { mime: 'audio/webm', b64: Buffer.from('voix').toString('base64'), secondes: 2 };
    expect((await g({ audio })).json().error.code).toBe('accord_voix_requis');
    const [acc] = await h.db
      .select({ id: t.account.id })
      .from(t.account)
      .where(eq(t.account.email, 'adulte.tuia@exemple.org'));
    await h.db.insert(t.consent).values({
      accountId: acc!.id,
      profileId: adulte,
      type: 'analyse_vocale_ia',
      textVersion: 'test',
    });
    entendus.splice(0, entendus.length, 'أريد');
    const r = (await g({ audio })).json();
    expect(r.bilan).toBe('presque');
    expect(r.mots.map((m: { etat: string }) => m.etat)).toEqual(['juste', 'manquant']);
    // aucun journal du tuteur pour l'étage 1 (rien n'est gardé)
    const logs = await h.db
      .select()
      .from(t.tutorLog)
      .where(and(eq(t.tutorLog.profileId, adulte), eq(t.tutorLog.action, 'guidee')));
    expect(logs).toHaveLength(0);
  });

  it('dialogue de la leçon pour l’écran : droits de la famille, jamais public', async () => {
    const r = await req(app, 'GET', `/api/v1/tuteur-ia/${adulte}/scenario/ad2.l01`, A);
    expect(r.statusCode).toBe(200);
    expect(r.json().tours).toHaveLength(3);
    expect(r.headers['cache-control']).toContain('no-store');
    expect(
      (await req(app, 'GET', `/api/v1/tuteur-ia/${adulte}/scenario/ad2.l01`, {})).statusCode,
    ).toBe(401);
    expect(
      (await req(app, 'GET', `/api/v1/tuteur-ia/${adulte}/scenario/ad2.l01`, P)).statusCode,
    ).toBe(404);
  });

  it('« vertex » sans projet ni contrôle : étage 2 indisponible (motif), étage 1 intact, aucun appel réseau', async () => {
    const e = (await req(bloque, 'GET', `/api/v1/tuteur-ia/${adulte}/etat?unit=ad2.l01`, A)).json();
    expect(e.libre).toMatchObject({ disponible: false, raison: 'mode' });
    const r = await libre(adulte, A, { texte: 'أريد تفاحا' }, bloque);
    expect(r.statusCode).toBe(404);
    expect(r.json().error).toMatchObject({
      code: 'libre_indisponible',
      motif: 'vertex_bloque_projet_absent',
    });
    expect(
      (
        await req(bloque, 'POST', `/api/v1/tuteur-ia/${adulte}/guidee`, A, {
          unitId: 'ad2.l01',
          tour: 1,
          texte: 'أريد تفاحا',
        })
      ).json().bilan,
    ).toBe('bravo');
  });
});
