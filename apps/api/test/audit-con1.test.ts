/**
 * Audit CON-1 (bloquant) : les corrigés des bilans et examens étaient envoyés à l'élève (API et paquet hors
 * ligne). Désormais : aucune clé de corrigé dans la leçon servie ni dans le paquet ; une leçon ordinaire garde
 * les siens (correction immédiate sur l'appareil). Contenu : édition synthétique (en1 : l03 bilan, l05 examen).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { answerPaths } from '@awform/content';
import { setupEdition, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_)('audit CON-1 — aucun corrigé d’épreuve chez l’élève', () => {
  let c: Ctx;
  beforeAll(async () => {
    c = await setupEdition(URL_!);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('API : bilan et examen sans corrigé ; leçon avec', async () => {
    for (const id of ['en1.l03', 'en1.l05']) {
      const u = (await c.req('GET', `/api/v1/units/${id}`)).json().unit;
      expect(answerPaths(u.lesson), id).toEqual([]);
    }
    const l = (await c.req('GET', '/api/v1/units/en1.l01')).json().unit;
    expect(answerPaths(l.lesson).length).toBeGreaterThan(0);
  });

  it('paquet hors ligne : bilan et examen sans corrigé', async () => {
    const p = (await c.req('GET', '/api/v1/packs/en1')).json() as {
      units: Array<{ id: string; kind?: string; lesson: unknown }>;
    };
    for (const id of ['en1.l03', 'en1.l05']) {
      const u = p.units.find((x) => x.id === id)!;
      expect(answerPaths(u.lesson), id).toEqual([]);
    }
  });
});
