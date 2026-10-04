import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Connexion du compte enseignant de test (second facteur obligatoire).
 * Cause d'e2e intermittents (lot 13, captures du lot 5) : le serveur n'accepte qu'un code par pas de 30 s,
 * toujours plus récent que le précédent (anti-rejeu), et seulement le pas courant ou ses voisins (± 30 s).
 * Plusieurs connexions enseignant dans la même demi-minute épuisaient les pas acceptables : « totp_incorrect ».
 * Ici : le pas utilisé est toujours plus récent que le dernier consommé (fichier partagé avec global-setup),
 * jamais en avance de plus d'un pas sur l'horloge (sinon on attend le pas suivant), et un refus est retenté
 * avec le pas d'après.
 */
const FILE = process.env.E2E_TOTP_FILE ?? join(tmpdir(), 'awform-e2e-totp-counter');
const STEP = 30_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lastUsed = (): number => {
  try {
    return Number(readFileSync(FILE, 'utf8')) || 0;
  } catch {
    return Number(process.env.E2E_TOTP_LAST ?? 0);
  }
};

export async function loginTeacher(page: Page): Promise<void> {
  const secret = process.env.E2E_TOTP_SECRET!;
  let last = lastUsed();
  let status = 0;
  let body = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const c = Math.max(Math.floor(Date.now() / STEP), last + 1);
    // le serveur accepte jusqu'au pas courant + 1 ; au-delà, attendre (1 s de marge après la bascule)
    const wait = (c - 1) * STEP + 1_000 - Date.now();
    if (wait > 0) {
      // l'attente du pas suivant ne doit pas manger le délai du test lui-même
      test.info().setTimeout(test.info().timeout + wait);
      await sleep(wait);
    }
    const r = await page.request.post('/api/v1/auth/login', {
      headers: { 'x-awform': '1' },
      data: { email: 'maitre@e2e.test', password: password(), totp: totp(secret, c) },
    });
    status = r.status();
    body = await r.text();
    // pas consommé (ou refusé) : ne plus jamais le reproposer
    last = c;
    writeFileSync(FILE, String(c));
    process.env.E2E_TOTP_LAST = String(c);
    if (status === 200) break;
    if (!body.includes('totp_incorrect')) break;
  }
  expect(status, body).toBe(200);
}
