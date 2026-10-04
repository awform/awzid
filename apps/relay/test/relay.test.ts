/**
 * Relais d'école : simulation de coupures d'Internet (serveur central factice qui coupe les connexions).
 * Vérifie : contenus servis depuis la copie ; réponses et récitations acceptées et CHIFFRÉES en file ;
 * reprise après redémarrage du relais ; relais sans doublon au retour d'Internet ; coupure PENDANT le
 * relais ; refus définitif effacé ; état pour le directeur.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRelay, type Relay } from '../src/relay.js';
import { RelayStore } from '../src/store.js';

interface Central {
  app: FastifyInstance;
  url: string;
  down: boolean;
  /** couper après N requêtes d'envoi (coupure pendant le relais) */
  cutAfter: number | null;
  attempts: Map<string, number>;
  recitations: Map<string, number>;
  cookies: string[];
  /** le central répond « non connecté » (session de l'élève expirée) */
  expired?: boolean;
}

async function fakeCentral(): Promise<Central> {
  const c: Central = {
    app: Fastify(),
    url: '',
    down: false,
    cutAfter: null,
    attempts: new Map(),
    recitations: new Map(),
    cookies: [],
  };
  c.app.removeAllContentTypeParsers();
  c.app.addContentTypeParser('*', { parseAs: 'buffer' }, (_r, b, d) => d(null, b));
  c.app.addHook('onRequest', async (req, reply) => {
    if (c.down) {
      reply.raw.destroy();
      return reply;
    }
    if (req.method === 'POST' && c.cutAfter !== null) {
      if (c.cutAfter <= 0) {
        reply.raw.destroy();
        return reply;
      }
      c.cutAfter--;
    }
  });
  c.app.get('/api/v1/health', async () => ({ status: 'ok' }));
  c.app.get('/api/v1/levels', async (_q, r) =>
    r.header('cache-control', 'public, max-age=60').send({ levels: [{ code: 'en1' }] }),
  );
  c.app.get('/api/v1/auth/me', async () => ({ account: { id: 'a' } }));
  c.app.post('/api/v1/attempts', async (req, reply) => {
    if (c.expired) return reply.code(401).send({ error: { code: 'non_connecte' } });
    if (req.headers['x-awform'] !== '1') return reply.code(403).send({ error: { code: 'csrf' } });
    c.cookies.push(String(req.headers.cookie ?? ''));
    const b = JSON.parse((req.body as Buffer).toString()) as { events: Array<{ id: string }> };
    const accepted = [];
    const duplicates = [];
    for (const e of b.events) {
      if (c.attempts.has(e.id)) duplicates.push(e.id);
      else accepted.push({ id: e.id, correct: true });
      c.attempts.set(e.id, (c.attempts.get(e.id) ?? 0) + 1);
    }
    return { accepted, duplicates, rejected: [] };
  });
  c.app.post('/api/v1/profiles/:id/recitations', async (req, reply) => {
    const k = String(req.headers['idempotency-key'] ?? '');
    if (!k) return reply.code(400).send({ error: { code: 'sans_cle' } });
    if (req.headers['x-parent-pin'] === 'faux')
      return reply.code(401).send({ error: { code: 'code_parent_incorrect' } });
    c.recitations.set(k, (c.recitations.get(k) ?? 0) + 1);
    return reply.code(c.recitations.get(k)! > 1 ? 200 : 201).send({ recitation: { id: k } });
  });
  await c.app.listen({ port: 0, host: '127.0.0.1' });
  const a = c.app.server.address() as { port: number };
  c.url = `http://127.0.0.1:${a.port}`;
  return c;
}

describe('relais d’école : coupures d’Internet simulées', () => {
  let central: Central;
  let dir: string;
  const key = randomBytes(32);
  let store: RelayStore;
  let relay: Relay;
  const profile = randomUUID();
  const H = {
    'x-awform': '1',
    cookie: 'awform_session=jeton-secret-eleve',
    'content-type': 'application/json',
  };
  const events = (n: number) => ({
    events: Array.from({ length: n }, () => ({
      id: randomUUID(),
      profileId: profile,
      response: {},
    })),
  });
  const start = () => {
    store = new RelayStore(dir, key);
    relay = buildRelay({ upstream: central.url, token: null, store, timeoutMs: 2000 });
    return relay;
  };

  beforeAll(async () => {
    central = await fakeCentral();
    dir = mkdtempSync(join(tmpdir(), 'relais-'));
    start();
    await relay.app.ready();
  });
  afterAll(async () => {
    await relay.app.close();
    store.close();
    await central.app.close();
  });

  it('Internet présent : tout passe au central, les contenus sont gardés en copie', async () => {
    expect(await relay.checkOnline()).toBe(true);
    const r = await relay.app.inject({ url: '/api/v1/levels' });
    expect(r.headers['x-awform-relais']).toBe('direct');
    expect(r.json().levels[0].code).toBe('en1');
    const e = events(2);
    const p = await relay.app.inject({
      method: 'POST',
      url: '/api/v1/attempts',
      headers: H,
      payload: e,
    });
    expect(p.json().accepted).toHaveLength(2);
    expect(central.attempts.size).toBe(2);
  });

  it('coupure : contenus depuis la copie, envois gardés chiffrés SANS être déclarés acceptés (OFF-1), le reste « hors ligne »', async () => {
    central.down = true;
    await relay.checkOnline();
    expect(relay.isOnline()).toBe(false);
    const c = await relay.app.inject({ url: '/api/v1/levels' });
    expect(c.statusCode).toBe(200);
    expect(c.headers['x-awform-relais']).toBe('copie');
    const me = await relay.app.inject({ url: '/api/v1/auth/me', headers: H });
    expect(me.statusCode).toBe(503);
    expect(me.json().error.code).toBe('hors_ligne_relais');
    const e = events(3);
    const p = await relay.app.inject({
      method: 'POST',
      url: '/api/v1/attempts',
      headers: H,
      payload: e,
    });
    // audit OFF-1 : jamais « accepté » avant le central — la tablette garde sa copie
    expect(p.statusCode).toBe(202);
    expect(p.json()).toMatchObject({ accepted: [], duplicates: [], relais: 'en_attente' });
    // la tablette renvoie le même lot : pas de doublon dans la file du relais
    await relay.app.inject({ method: 'POST', url: '/api/v1/attempts', headers: H, payload: e });
    const audio = Buffer.concat([Buffer.from('OggS-AUDIO-ELEVE'), randomBytes(500)]);
    const rec = await relay.app.inject({
      method: 'POST',
      url: `/api/v1/profiles/${profile}/recitations?classe=${randomUUID()}&passage=112:1-4`,
      headers: { ...H, 'content-type': 'audio/ogg', 'x-parent-pin': '2468' },
      payload: audio,
    });
    expect(rec.statusCode).toBe(202);
    expect(store.counts().enAttente).toBe(2);
    // rien en clair sur le disque : ni le cookie de session, ni le code parent, ni l'audio
    const raw = Buffer.concat(readdirSync(dir).map((f) => readFileSync(join(dir, f)))).toString(
      'latin1',
    );
    for (const s of ['jeton-secret-eleve', '2468', 'OggS-AUDIO-ELEVE', e.events[0]!.id])
      expect(raw.includes(s), s).toBe(false);
  });

  it('coupure de courant : le relais redémarre, la file est intacte', async () => {
    await relay.app.close();
    store.close();
    start();
    await relay.app.ready();
    expect(store.counts().enAttente).toBe(2);
    const st = (await relay.app.inject({ url: '/relais/etat.json' })).json();
    expect(st).toMatchObject({ enAttente: 2, enLigne: false });
    const html = await relay.app.inject({ url: '/relais/etat' });
    expect(html.body).toContain('Envois des élèves en attente');
  });

  it('coupure PENDANT le relais : ce qui est passé ne repart pas, le reste repart au retour', async () => {
    central.down = false;
    central.cutAfter = 1; // le premier envoi passe, la connexion est coupée au second
    const r1 = await relay.syncOnce();
    expect(r1.envoyes).toBe(1);
    expect(r1.restants).toBe(1);
    central.cutAfter = null;
    store.wakeAll();
    const r2 = await relay.syncOnce();
    expect(r2).toMatchObject({ envoyes: 1, restants: 0 });
    // chaque réponse d'élève est arrivée une seule fois, avec la session de l'élève
    expect([...central.attempts.values()].every((n) => n === 1)).toBe(true);
    expect(central.attempts.size).toBe(5);
    expect(central.cookies.at(-1)).toContain('jeton-secret-eleve');
    expect([...central.recitations.values()]).toEqual([1]);
  });

  it('rejeu d’un envoi déjà reçu (accusé perdu) : aucun doublon chez le central', async () => {
    central.down = true;
    await relay.checkOnline();
    const e = events(1);
    await relay.app.inject({ method: 'POST', url: '/api/v1/attempts', headers: H, payload: e });
    // lot 28 : file triée par date de création puis identifiant aléatoire — deux envois dans la même
    // milliseconde sortaient dans un ordre au hasard (test instable, 1 fois sur 5) ; la réponse d'abord
    await new Promise((r) => setTimeout(r, 5));
    await relay.app.inject({
      method: 'POST',
      url: `/api/v1/profiles/${profile}/recitations?classe=${randomUUID()}&passage=1:1-7`,
      headers: { ...H, 'content-type': 'audio/ogg' },
      payload: randomBytes(200),
    });
    central.down = false;
    // premier relais : le central enregistre mais la réponse est perdue (coupure après réception)
    const q = store.nextDue()!;
    await fetch(`${central.url}${q.path}`, {
      method: q.method,
      headers: q.headers,
      body: new Uint8Array(q.body),
    });
    await relay.syncOnce();
    expect(store.counts().enAttente).toBe(0);
    expect(central.attempts.get(e.events[0]!.id)).toBe(2); // reçu deux fois…
    // …mais compté une fois : l'API centrale déduplique par identifiant (duplicates)
    const keys = [...central.recitations.entries()];
    expect(keys.every(([k]) => k.startsWith('relais-'))).toBe(true);
  });

  it('refus définitif (4xx) : l’envoi est effacé, seule une trace technique reste', async () => {
    central.down = true;
    await relay.checkOnline();
    await relay.app.inject({
      method: 'POST',
      url: `/api/v1/profiles/${profile}/recitations?classe=${randomUUID()}&passage=1:1-7`,
      headers: { ...H, 'content-type': 'audio/ogg', 'x-parent-pin': 'faux' },
      payload: randomBytes(100),
    });
    central.down = false;
    const r = await relay.syncOnce();
    expect(r.refuses).toBe(1);
    expect(store.counts()).toMatchObject({ enAttente: 0, refuses: 1 });
    const row = store.db.prepare("SELECT payload FROM queue WHERE state = 'refuse'").get() as {
      payload: unknown;
    };
    expect(row.payload).toBeNull();
  });

  it('audit OFF-1 : session expirée au rejeu — l’envoi est GARDÉ (jamais effacé), plus rejoué, purgé à 7 jours', async () => {
    central.down = true;
    await relay.checkOnline();
    const e = events(2);
    await relay.app.inject({ method: 'POST', url: '/api/v1/attempts', headers: H, payload: e });
    central.down = false;
    central.expired = true;
    const r = await relay.syncOnce();
    expect(r).toMatchObject({ envoyes: 0, refuses: 0, restants: 0 });
    expect(store.counts().sessionExpiree).toBe(1);
    const row = store.db.prepare("SELECT payload FROM queue WHERE state = 'session'").get() as {
      payload: unknown;
    };
    expect(row.payload).not.toBeNull();
    central.expired = false;
    store.purgeRefused(Date.now() + 8 * 86_400_000);
    expect(store.counts().sessionExpiree).toBe(0);
  });

  it('audit OFF-6 : cookie exigé, taille et place bornées, copie des contenus bornée, ligne illisible en quarantaine', async () => {
    central.down = true;
    await relay.checkOnline();
    const post = (headers: Record<string, string>, payload: object | Buffer) =>
      relay.app.inject({ method: 'POST', url: '/api/v1/attempts', headers, payload });
    const { cookie: _c, ...sans } = H;
    void _c;
    expect((await post(sans, events(1))).statusCode).toBe(401);
    const big = {
      events: [{ id: randomUUID(), profileId: profile, response: { x: 'a'.repeat(300_000) } }],
    };
    expect((await post(H, big)).statusCode).toBe(413);
    // santé et chaînes de requête longues : jamais mises en copie
    const before = store.cacheCount();
    await relay.app.inject({ url: '/api/v1/health' });
    await relay.app.inject({ url: `/api/v1/quran/verses?s=1&x=${'y'.repeat(200)}` });
    expect(store.cacheCount()).toBe(before);
    // clé changée : la ligne devient illisible → quarantaine, la synchronisation continue sans exception
    await post(H, events(1));
    const other = new RelayStore(dir, randomBytes(32));
    expect(other.nextDue()).toBeNull();
    expect(other.counts().illisibles).toBeGreaterThanOrEqual(1);
    other.close();
  });
});
