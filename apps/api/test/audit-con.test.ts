/**
 * Audit — contenu : CON-3 (import sans registre, page publique du QR). Échouait avant la correction.
 */
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYNTH_DIR } from './content.js';
import { adult, setupEdition, type Ctx } from './helpers.js';

const URL_ = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_)('audit — contenu', () => {
  let c: Ctx;
  let dir: string;
  beforeAll(async () => {
    // copie du contenu synthétique ; une RÉFÉRENCE (recueil + numéro, pas un texte) ajoutée à un objectif
    dir = mkdtempSync(join(tmpdir(), 'awform-con3-'));
    cpSync(SYNTH_DIR, dir, {
      recursive: true,
      filter: (s) => !s.endsWith('/coran'),
    });
    // texte coranique : lien vers l'original (jamais copié ni retouché)
    symlinkSync(realpathSync(join(SYNTH_DIR, 'coran')), join(dir, 'coran'));
    const f = join(dir, 'data/en1/l01.js');
    const src = readFileSync(f, 'utf8');
    expect(src).toContain('"fr": "Je lis les mots."');
    writeFileSync(
      f,
      src.replace('"fr": "Je lis les mots."', '"fr": "Je lis les mots (Muslim, 54)."'),
    );
    c = await setupEdition(URL_!, {}, dir);
  });
  afterAll(async () => {
    await c?.app.close();
    await c?.h.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('CON-3 : sans registre, aucun numéro de hadith n’est montré (leçon élève, page publique du QR)', async () => {
    const { A } = await adult(c, 'con3@exemple.org');
    const u = await c.req('GET', '/api/v1/units/en1.l01', A);
    expect(u.statusCode, u.body).toBe(200);
    expect(u.body).toContain('Je lis les mots (Muslim).');
    expect(u.body).not.toContain('Muslim, 54');
    const p = await c.req('GET', '/api/v1/public/l/en1-01');
    expect(p.statusCode, p.body).toBe(200);
    expect(p.body).toContain('Muslim');
    expect(p.body).not.toContain('Muslim, 54');
  });
});
