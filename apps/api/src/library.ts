/**
 * Bibliothèque des livrets gradués (lot 8) : catalogue et livret (projection élève, illustrations).
 * Contenu éditorial public comme les leçons ; mis en cache par l'appareil pour la lecture hors ligne.
 */
import type { FastifyInstance } from 'fastify';
import { illustrationKeys, sceneKeys } from '@awform/content';
import { getBooklet, illustrationsFor, listBooklets, type Db } from '@awform/db';

type Edition = () => Promise<{ id: string; code: string } | null>;
const notFound = (message: string) => ({ error: { code: 'introuvable', message } });

export function registerLibrary(app: FastifyInstance, db: Db, edition: Edition): void {
  app.get('/api/v1/booklets', async (_req, reply) => {
    const ed = await edition();
    if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
    return { edition: ed.code, booklets: await listBooklets(db, ed.id) };
  });

  app.get<{ Params: { code: string } }>(
    '/api/v1/booklets/:code',
    {
      schema: {
        params: {
          type: 'object',
          properties: { code: { type: 'string', pattern: '^[a-z]{2,3}[0-9]{1,2}-[0-9]{2}$' } },
          required: ['code'],
        },
      },
    },
    async (req, reply) => {
      const ed = await edition();
      if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
      const b = await getBooklet(db, ed.id, req.params.code);
      if (!b) return reply.code(404).send(notFound(`livret ${req.params.code} introuvable`));
      // clés citées par le livret + décor et personnages par défaut des scènes (étal, palmier, soleil…)
      const keys = new Set([...illustrationKeys(b.content), ...sceneKeys(undefined)]);
      const illustrations = await illustrationsFor(db, ed.id, [...keys]);
      return {
        edition: ed.code,
        code: b.code,
        level: b.levelCode,
        catalogue: b.catalogue,
        booklet: b.content,
        illustrations,
      };
    },
  );
}
