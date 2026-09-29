/**
 * Audit — tuteur : CON-6 (texte libre hors « question » refusé par l'API), CON-7 (plafond de coût tenu sous
 * appels parallèles). Faux fournisseur « réel » : aucun appel réseau, coût simulé.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TutorProvider, TutorSetup } from '@awform/tutor';
import { adult, setupEdition, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;
const MODEL = 'claude-sonnet-5';
let calls = 0;
/** 2 $ par appel (100 000 jetons de sortie à 10 µ$ le jeton ; hors plafond adulte de 3 $ au 2e appel) */
const cher: TutorProvider = {
  name: 'faux-reel',
  real: true,
  respond: async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 50));
    return {
      draft: { decision: 'repondre', message_fr: 'Une autre explication.' },
      status: 'ok',
      usage: { inputTokens: 0, outputTokens: 200_000, cacheReadTokens: 0 },
    };
  },
};

describe.skipIf(!URL_)('audit — tuteur', () => {
  let c: Ctx;
  beforeAll(async () => {
    const tutor: TutorSetup = { mode: 'claude', provider: cher, modelFor: () => MODEL };
    c = await setupEdition(URL_!, { tutor });
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
  });

  it('CON-6 : texte libre avec une autre action que « question » : 400', async () => {
    const { A, profileId } = await adult(c, 'con6@exemple.org');
    const r = await c.req('POST', `/api/v1/tutor/${profileId}/ask`, A, {
      unitId: 'ad1.l01',
      action: 'explique',
      text: 'je veux me suicider ce soir',
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('texte_hors_question');
  });

  it('CON-7 : 10 appels simultanés ne dépassent pas le plafond mensuel (un seul appel à la fois par profil)', async () => {
    const { A, profileId } = await adult(c, 'con7@exemple.org');
    calls = 0;
    const rs = await Promise.all(
      Array.from({ length: 10 }, () =>
        c.req('POST', `/api/v1/tutor/${profileId}/ask`, A, {
          unitId: 'ad1.l01',
          action: 'explique',
        }),
      ),
    );
    for (const r of rs) expect([200, 429], r.body).toContain(r.statusCode);
    // puis des appels l'un après l'autre : le plafond (3 $) arrête le modèle après 2 appels (2 $ chacun)
    for (let i = 0; i < 4; i++)
      await c.req('POST', `/api/v1/tutor/${profileId}/ask`, A, {
        unitId: 'ad1.l01',
        action: 'explique',
      });
    expect(calls).toBeLessThanOrEqual(2);
  });
});
