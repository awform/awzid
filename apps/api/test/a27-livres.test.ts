/**
 * Chantier A27 sur les VRAIS livres (si présents) : la leçon où le livre fait recopier le PREMIER verset ouvre
 * « J'écris le Coran » — vérifiée dans les données (en1 l25, ad1 l19) ; la ligne recopiée est un verset Tanzil
 * entier. Positionnement : exercices de l'examen de fin de niveau retenus, aucune réponse envoyée.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adult, child, parent, setupEdition, type Ctx } from './helpers.js';
import { REAL_BOOKS, TEST_CONTENT_DIR } from './content.js';

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL || !REAL_BOOKS)(
  'A27 — vrais livres : premier verset recopié, positionnement',
  () => {
    let c: Ctx;
    beforeAll(async () => {
      c = await setupEdition(URL!, {}, TEST_CONTENT_DIR, ['en1', 'en2', 'ad1', 'ad2']);
    }, 240_000);
    afterAll(async () => {
      await c?.app.close();
      await c?.h.close();
    });

    it('enfants : « J’écris le Coran » à partir d’en1 l25 ; adultes : à partir d’ad1 l19', async () => {
      const fam = await parent(c, 'livres-a27@exemple.org');
      const kid = await child(c, fam.P, 'Amina', 8);
      const s = (await c.req('GET', `/api/v1/profiles/${kid}/espace/arabe`, fam.P)).json();
      expect(s.coranEcriture).toEqual({ depuis: 'en1.l25', visible: false });
      const { A, profileId } = await adult(c, 'livres-adulte-a27@exemple.org');
      expect(
        (await c.req('POST', `/api/v1/profiles/${profileId}/commencer/arabe`, A, {})).statusCode,
      ).toBe(201);
      const a = (await c.req('GET', `/api/v1/profiles/${profileId}/espace/arabe`, A)).json();
      expect(a.coranEcriture).toEqual({ depuis: 'ad1.l19', visible: false });
    });

    it('positionnement sur les livres : quatre exercices au plus de l’examen de fin de niveau, sans corrigé', async () => {
      const fam = await parent(c, 'livres-pos-a27@exemple.org');
      const kid = await child(c, fam.P, 'Nour', 9);
      for (const lv of ['en1', 'en2']) {
        const r = await c.req('GET', `/api/v1/profiles/${kid}/positionnement/arabe/${lv}`, fam.P);
        expect(r.statusCode, r.body).toBe(200);
        const v = r.json();
        expect(v.unit).toMatch(new RegExp(`^${lv}\\.l\\d\\d$`));
        expect(v.exercises.length).toBeGreaterThanOrEqual(3);
        expect(v.exercises.length).toBeLessThanOrEqual(4);
        expect(r.body).not.toMatch(/"reponse"|"vrai"\s*:/);
      }
    });
  },
);
