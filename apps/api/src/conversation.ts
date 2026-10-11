/**
 * A26b, phase 1 — scénarios « Je parle » (sans IA) servis par l'API, avec les MÊMES droits que les leçons :
 *  - personne connectée, profil de la famille (401 / 403 / 404 comme les autres routes de profil) ;
 *  - interrupteur `conversation` (état de base « beta ») ;
 *  - droits de la formule (audit PAY-4, comme `GET /units/:id`) ;
 *  - règle du parcours (A27) : niveau courant, niveaux terminés en révision, le suivant en aperçu ; tout autre
 *    niveau de la filière est fermé (403).
 * Les fichiers (`packages/content/conversation/<niveau>/<lecon>.json`, générés depuis les livres, versionnés) ne
 * sont jamais publics ; l'application garde sur l'appareil ceux qu'elle a reçus (hors ligne ensuite).
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { accessFor, currentLevelOf, getUnitForStudent, type Db } from '@awform/db';
import type { ContentRights } from './billing.js';
import { exigeFonction } from './f5.js';
import { err, familyProfile } from './guards.js';
import { type Edition } from './routes-common.js';

const CONV_UNIT = '^(en|ado|ad)[0-9]{1,2}\\.l[0-9]{2}$';

/** Dossier des scénarios : livré avec le paquet `@awform/content` (champ `files`). */
export function conversationDir(): string {
  if (process.env.AWFORM_CONVERSATION_DIR) return process.env.AWFORM_CONVERSATION_DIR;
  const main = fileURLToPath(import.meta.resolve('@awform/content'));
  return join(dirname(main), '..', 'conversation');
}

export function registerConversation(
  app: FastifyInstance,
  db: Db,
  edition: Edition,
  rights: ContentRights,
): void {
  const dir = conversationDir();
  app.get<{ Params: { id: string; unit: string } }>(
    '/api/v1/profiles/:id/conversation/:unit',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            unit: { type: 'string', pattern: CONV_UNIT },
          },
          required: ['id', 'unit'],
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      if (!(await exigeFonction(db, req, reply, 'conversation', p.id))) return reply;
      const ed = await edition();
      if (!ed) return err(reply, 404, 'introuvable');
      const unit = await getUnitForStudent(db, ed.id, req.params.unit);
      if (!unit) return err(reply, 404, 'introuvable');
      const e = await rights.of(req.auth);
      if (!rights.canOpen(e, unit))
        return err(reply, 403, 'droits_insuffisants', { plan: e?.plan });
      const [level, lecon] = req.params.unit.split('.') as [string, string];
      const cur = await currentLevelOf(db, p.id, 'arabe');
      if (accessFor(cur?.levelCode ?? null, level) === 'ferme')
        return err(reply, 403, 'niveau_ferme');
      let body: string;
      try {
        body = await readFile(join(dir, level, `${lecon}.json`), 'utf8');
      } catch {
        return err(reply, 404, 'introuvable');
      }
      return reply
        .header('Cache-Control', 'private, no-store')
        .type('application/json; charset=utf-8')
        .send(body);
    },
  );
}
