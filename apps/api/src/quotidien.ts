/**
 * Chantier A12 — « Au quotidien » : adhkār tirés des livres gelés (projection ÉLÈVE de l'édition publiée).
 * Aucune donnée de l'utilisateur ici (ni position, ni horaires : tout est calculé sur l'appareil). La route est
 * publique et identique pour tous (cache public, ETag) ; l'application la garde sur l'appareil (hors ligne).
 * Les textes viennent tels quels des leçons (voir @awform/content/adhkar) ; les numéros de hadiths non vérifiés
 * sont déjà retirés par la projection élève.
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildAdhkar } from '@awform/content/adhkar';
import { getUnitForStudent, unitTitles, type Db } from '@awform/db';
import { notFound, type Edition } from './routes-common.js';

export function registerQuotidien(app: FastifyInstance, db: Db, edition: Edition): void {
  let memo: { edition: string; etag: string; body: string } | null = null;

  app.get('/api/v1/adhkar', async (req, reply) => {
    const ed = await edition();
    if (!ed) return reply.code(404).send(notFound('aucune édition publiée'));
    if (!memo || memo.edition !== ed.id) {
      const set = await buildAdhkar(
        async (unit) => (await getUnitForStudent(db, ed.id, unit))?.lesson ?? null,
      );
      // titre humain de la leçon d'origine (jamais l'identifiant brut « re1.l23 » à l'écran)
      const titres = await unitTitles(db, ed.id, [
        ...new Set(set.categories.flatMap((c) => c.items.map((i) => i.unit))),
      ]);
      const categories = set.categories.map((c) => ({
        ...c,
        items: c.items.map((i) => ({ ...i, unitTitleFr: titres.get(i.unit) ?? null })),
      }));
      const body = JSON.stringify({ edition: ed.code, ...set, categories });
      memo = {
        edition: ed.id,
        etag: `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`,
        body,
      };
    }
    reply.header('ETag', memo.etag).header('Cache-Control', 'public, max-age=3600');
    if (req.headers['if-none-match'] === memo.etag) return reply.code(304).send();
    return reply.type('application/json; charset=utf-8').send(memo.body);
  });
}
