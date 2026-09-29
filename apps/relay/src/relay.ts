/**
 * Relais d'école (lot 17) : serveur local placé entre les tablettes de l'école et le serveur central.
 *  - Internet présent : il transmet tout au central (et garde une copie des CONTENUS publics) ;
 *  - Internet absent : il sert les contenus depuis sa copie, ACCEPTE les réponses et les récitations des
 *    élèves (file chiffrée) et répond aux autres demandes « hors ligne » (503) — l'application sait déjà
 *    travailler hors ligne ;
 *  - Internet revenu : il relaie la file dans l'ordre, sans doublon (identifiants d'événements ; clé
 *    d'idempotence pour les récitations), et reprend là où il s'était arrêté après une coupure (réseau ou
 *    courant) ;
 *  - il remonte son état au central (battement) et récupère le certificat HTTPS du sous-domaine de l'école.
 * Le relais n'a aucun droit propre sur les données : chaque envoi garde l'authentification de l'élève.
 */
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { RelayStore } from './store.js';

/** Contenus publics mis en copie (jamais de données personnelles). */
export const CACHEABLE =
  /^\/api\/v1\/(config|levels(\/[a-z0-9]+\/units)?|units\/[a-z0-9.]+|packs(\/[a-z0-9]+)?|quran\/(meta|verses)|hifz\/books(\/[a-z0-9_]+)?|booklets(\/[a-z0-9-]+)?|activites\/racines|billing\/plans|public\/l\/[a-z0-9-]+)$/;

/** Chaîne de requête des contenus mis en copie : bornée (audit OFF-6, copie non saturable). */
const MAX_QUERY = 120;
/** Taille maximale d'un envoi mis en file (réponses : 256 Ko ; récitation : 3 Mo, comme le central). */
const MAX_ATTEMPTS_BYTES = 256 * 1024;
const MAX_RECITATION_BYTES = 3 * 1024 * 1024;
/** Envois mis en file par adresse et par heure (audit OFF-6). */
const MAX_PER_IP_HOUR = 600;

/** Envois gardés en file quand le central est injoignable. */
const QUEUEABLE = [/^\/api\/v1\/attempts$/, /^\/api\/v1\/profiles\/[0-9a-f-]{36}\/recitations$/];

const FORWARD = [
  'cookie',
  'x-awform',
  'content-type',
  'accept',
  'if-none-match',
  'x-parent-pin',
  'idempotency-key',
];
const BACK = ['content-type', 'set-cookie', 'etag', 'cache-control', 'content-disposition'];

export interface RelayOptions {
  /** serveur central, ex. https://app.awzid.org */
  upstream: string;
  /** jeton du relais (enregistré par l'équipe) */
  token: string | null;
  store: RelayStore;
  version?: string;
  /** délai d'une requête vers le central (ms) */
  timeoutMs?: number;
  /** certificat reçu : écrit pour Caddy (null : mode « autorité locale ») */
  onCertificate?: (c: { host: string; cert: string; key: string }) => void | Promise<void>;
}

export interface Relay {
  app: FastifyInstance;
  isOnline(): boolean;
  checkOnline(): Promise<boolean>;
  syncOnce(): Promise<{ envoyes: number; refuses: number; restants: number }>;
  heartbeat(): Promise<boolean>;
}

class Offline extends Error {}

export function buildRelay(o: RelayOptions): Relay {
  const store = o.store;
  const timeout = o.timeoutMs ?? 8000;
  let online = false;
  let lastCheck = 0;

  async function upstream(
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: Buffer,
  ): Promise<Response> {
    try {
      return await fetch(`${o.upstream}${path}`, {
        method,
        headers,
        body: body && body.length ? body : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      online = false;
      throw new Offline(String((e as Error).message ?? e));
    }
  }

  async function checkOnline(): Promise<boolean> {
    try {
      const r = await fetch(`${o.upstream}/api/v1/health`, { signal: AbortSignal.timeout(3000) });
      const was = online;
      online = r.ok;
      if (online && !was) store.wakeAll();
    } catch {
      online = false;
    }
    lastCheck = Date.now();
    store.setMeta('dernier_controle', new Date(lastCheck).toISOString());
    if (online) store.setMeta('derniere_connexion', new Date(lastCheck).toISOString());
    return online;
  }

  const pick = (req: FastifyRequest) => {
    const h: Record<string, string> = {};
    for (const k of FORWARD) {
      const v = req.headers[k];
      if (typeof v === 'string' && v) h[k] = v;
    }
    return h;
  };
  const send = async (reply: FastifyReply, r: Response) => {
    for (const k of BACK) {
      if (k === 'set-cookie') {
        for (const c of r.headers.getSetCookie()) reply.header('set-cookie', c);
      } else {
        const v = r.headers.get(k);
        if (v) reply.header(k, v);
      }
    }
    reply.header('x-awform-relais', 'direct');
    return reply.code(r.status).send(Buffer.from(await r.arrayBuffer()));
  };
  const offlineReply = (reply: FastifyReply) =>
    reply
      .code(503)
      .header('x-awform-relais', 'hors-ligne')
      .send({ error: { code: 'hors_ligne_relais' } });

  /**
   * Réponse à un envoi mis en file. Audit OFF-1 : JAMAIS « accepté » avant la confirmation du central — la
   * tablette garde sa copie (liste `accepted` vide) et la renverra ; le relais relaie la sienne dès qu'il
   * le peut, sans doublon (identifiants d'événements, empreinte des envois).
   */
  function queuedReply(reply: FastifyReply, path: string) {
    reply.header('x-awform-relais', 'en-attente');
    if (path === '/api/v1/attempts')
      return reply
        .code(202)
        .send({ accepted: [], duplicates: [], rejected: [], relais: 'en_attente' });
    return reply
      .code(202)
      .send({ recitation: { id: null, enAttente: true }, relais: 'en_attente' });
  }

  /** envois mis en file par adresse (fenêtre d'une heure) */
  const perIp = new Map<string, { n: number; since: number }>();
  function ipAllowed(ip: string): boolean {
    const now = Date.now();
    const e = perIp.get(ip);
    if (!e || now - e.since > 3_600_000) {
      perIp.set(ip, { n: 1, since: now });
      return true;
    }
    e.n++;
    return e.n <= MAX_PER_IP_HOUR;
  }

  const app = Fastify({ logger: false, bodyLimit: 4 * 1024 * 1024 });
  // le relais transporte les corps tels quels (JSON compris) : aucun analyseur
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/api/*',
    handler: async (req, reply) => {
      const path = req.url;
      const bare = path.split('?')[0]!;
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const headers = pick(req);
      if (Date.now() - lastCheck > 10_000) await checkOnline();

      if (req.method === 'GET' || req.method === 'HEAD') {
        const cacheable = CACHEABLE.test(bare) && path.length - bare.length <= MAX_QUERY;
        if (online) {
          try {
            // copie des contenus : sans ETag conditionnel, pour garder un corps complet
            const h = { ...headers };
            if (cacheable) delete h['if-none-match'];
            const r = await upstream(req.method, path, h);
            if (cacheable && r.ok) {
              const buf = Buffer.from(await r.arrayBuffer());
              const hh: Record<string, string> = {};
              for (const k of ['content-type', 'etag', 'cache-control']) {
                const v = r.headers.get(k);
                if (v) hh[k] = v;
              }
              store.putCache(path, { status: r.status, headers: hh, body: buf });
              for (const [k, v] of Object.entries(hh)) reply.header(k, v);
              return reply.header('x-awform-relais', 'direct').code(r.status).send(buf);
            }
            return await send(reply, r);
          } catch (e) {
            if (!(e instanceof Offline)) throw e;
          }
        }
        const c = cacheable ? store.getCache(path) : null;
        if (!c) return offlineReply(reply);
        for (const [k, v] of Object.entries(c.headers)) reply.header(k, v);
        return reply.header('x-awform-relais', 'copie').code(c.status).send(c.body);
      }

      const queueable = QUEUEABLE.some((re) => re.test(bare));
      // récitation : une clé d'idempotence rend le rejeu sans doublon
      if (queueable && bare.endsWith('/recitations') && !headers['idempotency-key'])
        headers['idempotency-key'] = `relais-${randomUUID()}`;
      if (online) {
        try {
          const r = await upstream(req.method, path, headers, body);
          // le central est joignable mais en difficulté : on garde l'envoi plutôt que de le perdre
          if (!(queueable && r.status >= 500)) return await send(reply, r);
        } catch (e) {
          if (!(e instanceof Offline)) throw e;
        }
      }
      if (!queueable) return offlineReply(reply);
      // audit OFF-6 : seulement un élève connecté (cookie de session), taille, place et débit bornés
      if (!/(^|;\s*)awform_session=/.test(headers.cookie ?? ''))
        return reply.code(401).send({ error: { code: 'non_connecte' } });
      const limit = bare === '/api/v1/attempts' ? MAX_ATTEMPTS_BYTES : MAX_RECITATION_BYTES;
      if (body.length > limit) return reply.code(413).send({ error: { code: 'trop_volumineux' } });
      if (!ipAllowed(req.ip)) return reply.code(429).send({ error: { code: 'trop_de_demandes' } });
      if (!store.hasRoom(body.length))
        return reply.code(507).send({ error: { code: 'relais_plein' } });
      store.enqueue(req.method, path, headers, body);
      return queuedReply(reply, bare);
    },
  });

  // ------------------------------------------------------------ état pour le directeur (sans données)

  app.get('/relais/etat.json', async () => ({
    enLigne: online,
    ...store.counts(),
    envoyes: Number(store.getMeta('envoyes') ?? 0),
    contenus: store.cacheCount(),
    derniereConnexion: store.getMeta('derniere_connexion'),
    dernierEnvoi: store.getMeta('dernier_envoi'),
    version: o.version ?? 'dev',
  }));

  app.get('/relais/etat', async (_req, reply) => {
    const c = store.counts();
    const envoyes = Number(store.getMeta('envoyes') ?? 0);
    const derniere = store.getMeta('derniere_connexion');
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Relais AWFORM</title>
<style>body{font:18px/1.5 system-ui,sans-serif;max-width:560px;margin:24px auto;padding:0 16px;color:#1b2a3a;background:#fbf8f1}
.ok{color:#1b7f4b}.ko{color:#8a5a00}li{margin:6px 0}</style></head><body>
<h1>Relais AWFORM de l'école</h1>
<p class="${online ? 'ok' : 'ko'}"><strong>${online ? 'Internet : connecté' : 'Internet : pas de connexion — l’école continue de travailler'}</strong></p>
<ul>
<li>Envois des élèves en attente d'Internet : <strong>${c.enAttente}</strong></li>
<li>Envois déjà transmis : ${envoyes}</li>
<li>Envois refusés par le serveur (à signaler) : ${c.refuses}</li>
<li>Envois gardés en attendant que l'élève se reconnecte : ${c.sessionExpiree}</li>
<li>Contenus gardés pour l'école : ${store.cacheCount()}</li>
<li>Dernière connexion à Internet : ${derniere ? new Date(derniere).toLocaleString('fr-FR') : 'jamais'}</li>
</ul>
<p>Cette page se met à jour toute seule toutes les 30 secondes.</p>
<script>setTimeout(function(){location.reload()},30000)</script>
</body></html>`;
    return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-store').send(html);
  });

  // ------------------------------------------------------------ relais de la file

  /** 401 « non connecté » du central (session expirée) — à distinguer d'un refus (code parent faux…) */
  async function sessionExpired(r: Response): Promise<boolean> {
    try {
      const b = (await r.clone().json()) as { error?: { code?: string } };
      return b.error?.code === 'non_connecte' || b.error?.code === 'session_expiree';
    } catch {
      return false;
    }
  }

  let running = false;
  async function syncOnce() {
    let envoyes = 0;
    let refuses = 0;
    if (running) return { envoyes, refuses, restants: store.counts().enAttente };
    running = true;
    try {
      if (!online && !(await checkOnline()))
        return { envoyes, refuses, restants: store.counts().enAttente };
      for (;;) {
        const q = store.nextDue();
        if (!q) break;
        let r: Response;
        try {
          r = await upstream(
            q.method,
            q.path,
            { ...q.headers, 'x-awform-relais': 'rejeu' },
            q.body,
          );
        } catch (e) {
          // coupure pendant le relais : on s'arrête, l'envoi reste en file et repartira
          store.retryLater(q.id, String((e as Error).message ?? e));
          break;
        }
        if (r.status >= 200 && r.status < 300) {
          store.done(q.id);
          store.setMeta('dernier_envoi', new Date().toISOString());
          envoyes++;
        } else if (r.status === 401 && (await sessionExpired(r))) {
          // audit OFF-1 : session de l'élève expirée — l'envoi est gardé, jamais effacé
          store.holdSession(q.id, r.status);
        } else if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) {
          store.refused(q.id, r.status, (await r.text().catch(() => '')).slice(0, 200));
          refuses++;
        } else {
          store.retryLater(q.id, `HTTP ${r.status}`);
          break;
        }
      }
      store.purgeRefused();
      return { envoyes, refuses, restants: store.counts().enAttente };
    } finally {
      running = false;
    }
  }

  async function heartbeat(): Promise<boolean> {
    if (!o.token || !online) return false;
    try {
      const r = await fetch(`${o.upstream}/api/v1/relais/battement`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-awform': '1', 'x-relais-jeton': o.token },
        body: JSON.stringify({ ...store.counts(), version: o.version ?? 'dev' }),
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) return false;
      if (o.onCertificate) {
        const c = await fetch(`${o.upstream}/api/v1/relais/certificat`, {
          headers: { 'x-relais-jeton': o.token },
          signal: AbortSignal.timeout(5000),
        });
        if (c.ok)
          await o.onCertificate((await c.json()) as { host: string; cert: string; key: string });
      }
      return true;
    } catch {
      return false;
    }
  }

  return { app, isOnline: () => online, checkOnline, syncOnce, heartbeat };
}
