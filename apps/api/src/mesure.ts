/**
 * V2-0 (29/10/2026) — MESURE ANONYME de l'inscription et de la connexion.
 *  - `POST /api/v1/mesure` : compte UNE étape atteinte (liste fermée), avec la plateforme (mobile / bureau) et la
 *    langue de l'interface. Réponse 204. Ni adresse IP, ni identifiant, ni e-mail, ni cookie n'est lu ni gardé :
 *    seul un compteur par (heure arrondie, étape, plateforme, langue) est incrémenté (`funnel_event`, 90 jours).
 *  - `GET /api/v1/admin/entonnoir?jours=7|30` : l'entonnoir (nombre et pourcentage à chaque étape), pour
 *    l'administrateur et le support (second facteur exigé).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { funnelReport, recordFunnel, schema as t, type Db } from '@awform/db';
import { hasRole } from './auth/service.js';

export function registerMesure(app: FastifyInstance, db: Db): void {
  app.post<{ Body: { etape: string; plateforme: string; langue: string } }>(
    '/api/v1/mesure',
    {
      bodyLimit: 1024,
      schema: {
        body: {
          type: 'object',
          required: ['etape', 'plateforme', 'langue'],
          additionalProperties: false,
          properties: {
            etape: { enum: [...t.FUNNEL_ETAPES] },
            plateforme: { enum: [...t.FUNNEL_PLATEFORMES] },
            langue: { enum: [...t.FUNNEL_LANGUES] },
          },
        },
      },
    },
    async (req, reply) => {
      // rien de la requête n'est lu en dehors du corps : ni req.ip, ni cookies, ni en-têtes
      await recordFunnel(db, req.body.etape, req.body.plateforme, req.body.langue);
      return reply.code(204).send();
    },
  );

  const needAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    const e = (status: number, code: string) => reply.code(status).send({ error: { code } });
    if (!req.auth) return e(401, 'non_connecte');
    if (!hasRole(req.auth, 'admin', 'support')) return e(403, 'reserve_admin');
    if (!req.auth.mfaVerified)
      return e(403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  };

  app.get<{ Querystring: { jours?: number } }>(
    '/api/v1/admin/entonnoir',
    {
      preHandler: needAdmin,
      schema: {
        querystring: {
          type: 'object',
          properties: { jours: { type: 'integer', enum: [7, 30] } },
        },
      },
    },
    async (req) => {
      const jours = req.query.jours ?? 7;
      return { jours, ...(await funnelReport(db, jours)) };
    },
  );
}
