/**
 * Réglages publics de l'application et activités du lot 15.
 *  - GET /api/v1/config : langues en préparation (traductions NON relues) montrables ou non sur ce serveur —
 *    drapeau AWFORM_LANGUES_PREPARATION (« on » en démonstration, absent en production tant que non relues) ;
 *  - GET /api/v1/activites/racines : « construire un mot à partir de sa racine » — racines, schèmes et mots
 *    EXTRAITS des livres gelés et vérifiés à l'import (jamais inventés ; aucune racine coranique non vérifiée).
 */
import type { FastifyInstance } from 'fastify';
import { evalDocs, type Db } from '@awform/db';
import { vapidPublicKey } from './push.js';

type Edition = () => Promise<{ id: string; code: string } | null>;

export function languesEnPreparation(): boolean {
  return process.env.AWFORM_LANGUES_PREPARATION === 'on';
}

export function registerActivities(app: FastifyInstance, db: Db, edition: Edition): void {
  app.get('/api/v1/config', async (_req, reply) => {
    reply.header('Cache-Control', 'no-cache');
    return {
      languesEnPreparation: languesEnPreparation(),
      // clé PUBLIQUE des notifications (null : notifications non configurées sur ce serveur)
      vapidPublicKey: vapidPublicKey(),
    };
  });

  app.get('/api/v1/activites/racines', async (_req, reply) => {
    const ed = await edition();
    if (!ed) return reply.code(404).send({ error: { code: 'aucune_edition' } });
    const docs = await evalDocs(db, ed.id);
    reply.header('Cache-Control', 'public, max-age=3600');
    return { edition: ed.code, items: (docs.racines as unknown[] | undefined) ?? [] };
  });
}
