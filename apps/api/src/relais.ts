/**
 * Relais d'école — côté serveur central (lot 17).
 *  - POST /api/v1/relais/battement : le relais (jeton `x-relais-jeton`) signale qu'il est en ligne et
 *    remonte son état (envois en attente ou refusés, version) — journal remonté au central ;
 *  - GET /api/v1/relais/certificat : certificat HTTPS du sous-domaine de l'école, obtenu par le serveur
 *    central (Caddy, « on demand », défi HTTP-01 : le nom public pointe vers le central) et remis au relais
 *    authentifié ; ainsi le même nom sert l'application à l'école (DNS du Wi-Fi → relais) et ailleurs
 *    (DNS public → central), sans rien installer sur les tablettes ;
 *  - GET /api/v1/relais/tls-autorise?domain=… : Caddy ne demande un certificat que pour un relais enregistré.
 * Les réponses et récitations relayées gardent l'authentification de l'élève (cookie de sa session) :
 * le relais n'a aucun droit sur les données, il ne fait que transporter.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { relayByToken, relayHeartbeat, relayHostAllowed, type Db } from '@awform/db';

const err = (reply: FastifyReply, status: number, code: string) =>
  reply.code(status).send({ error: { code } });

/** Certificat et clé d'un nom dans le stockage de Caddy (lecture seule). */
export function findCaddyCert(dir: string, host: string): { cert: string; key: string } | null {
  const base = join(dir, 'certificates');
  if (!existsSync(base)) return null;
  for (const issuer of readdirSync(base)) {
    const d = join(base, issuer, host);
    const crt = join(d, `${host}.crt`);
    const key = join(d, `${host}.key`);
    if (existsSync(crt) && existsSync(key))
      return { cert: readFileSync(crt, 'utf8'), key: readFileSync(key, 'utf8') };
  }
  return null;
}

export function registerRelais(app: FastifyInstance, db: Db, certsDir: string | null): void {
  const auth = async (req: FastifyRequest) =>
    relayByToken(db, String(req.headers['x-relais-jeton'] ?? '') || undefined);

  app.post<{ Body: { enAttente?: number; refuses?: number; version?: string } }>(
    '/api/v1/relais/battement',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            enAttente: { type: 'integer', minimum: 0 },
            refuses: { type: 'integer', minimum: 0 },
            version: { type: 'string', maxLength: 40 },
          },
        },
      },
    },
    async (req, reply) => {
      const r = await auth(req);
      if (!r) return err(reply, 401, 'relais_inconnu');
      await relayHeartbeat(db, r.id, { ...req.body, recuLe: new Date().toISOString() });
      return { ok: true, host: r.host, heure: new Date().toISOString() };
    },
  );

  app.get('/api/v1/relais/certificat', async (req, reply) => {
    const r = await auth(req);
    if (!r) return err(reply, 401, 'relais_inconnu');
    const c = certsDir ? findCaddyCert(certsDir, r.host) : null;
    if (!c) return err(reply, 404, 'certificat_absent');
    reply.header('Cache-Control', 'no-store');
    return { host: r.host, ...c };
  });

  app.get<{ Querystring: { domain?: string } }>(
    '/api/v1/relais/tls-autorise',
    async (req, reply) => {
      const d = String(req.query.domain ?? '').toLowerCase();
      if (d && (await relayHostAllowed(db, d))) return { ok: true };
      return err(reply, 404, 'domaine_inconnu');
    },
  );
}
