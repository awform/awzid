/**
 * V2-5, relecture de sécurité — mineurs : empreintes Argon2 limitées à 2 à la fois, plafond par adresse de
 * « login-disponible ».
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Semaphore } from '../src/ecole-eleves.js';
import { parent, setup, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;

describe('sémaphore des empreintes (sans base)', () => {
  it('jamais plus de 2 tâches à la fois, toutes exécutées', async () => {
    const s = new Semaphore(2);
    let en_cours = 0;
    let max = 0;
    const faites: number[] = [];
    await Promise.all(
      Array.from({ length: 9 }, (_, i) =>
        s.run(async () => {
          en_cours++;
          max = Math.max(max, en_cours);
          await new Promise((r) => setTimeout(r, 5));
          en_cours--;
          faites.push(i);
        }),
      ),
    );
    expect(max).toBe(2);
    expect(faites).toHaveLength(9);
  });
  it('une tâche qui échoue libère sa place', async () => {
    const s = new Semaphore(1);
    await expect(s.run(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(s.run(async () => 'ok')).resolves.toBe('ok');
  });
});

describe.skipIf(!URL_)('login-disponible : plafond par adresse (awform_test)', () => {
  let c: Ctx;
  beforeAll(async () => {
    c = await setup(URL_!);
  }, 60_000);
  afterAll(async () => {
    await c.app.close();
    await c.h.close();
  });

  it('60 demandes par heure et par adresse, tous comptes confondus (chaque compte reste sous ses 20)', async () => {
    const comptes = [];
    for (let i = 0; i < 4; i++) comptes.push((await parent(c, `ld${i}@exemple.org`)).P);
    let n = 0;
    let dernier = 200;
    for (let tour = 0; tour < 16 && dernier === 200; tour++)
      for (const P of comptes) {
        const r = await c.req(
          'GET',
          `/api/v1/profiles/login-disponible?login=lina-${n}&prenom=Lina`,
          P,
        );
        n++;
        dernier = r.statusCode;
        if (dernier !== 200) {
          expect(r.json().error.code).toBe('trop_de_demandes');
          break;
        }
      }
    expect(dernier).toBe(429);
    expect(n).toBe(61);
  }, 60_000);
});
