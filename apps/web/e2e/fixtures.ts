import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test as base, type Page } from '@playwright/test';
import { totp } from './totp';

export { PARENT_PIN } from './totp';

/**
 * Chaque test est connecté (par défaut) au compte ADULTE de test : un seul profil, qui répond aux
 * exercices. `compte: 'parent'` pour le parent (deux enfants), `compte: null` pour un visiteur.
 */
export const EMAILS = { adulte: 'adulte@e2e.test', parent: 'parent@e2e.test' } as const;
export type Compte = keyof typeof EMAILS | null;

export function password(): string {
  const p = process.env.E2E_PASSWORD;
  if (!p) throw new Error('E2E_PASSWORD absent : lancer par playwright (globalSetup)');
  return p;
}

export async function login(page: Page, compte: keyof typeof EMAILS): Promise<void> {
  const r = await page.request.post('/api/v1/auth/login', {
    headers: { 'x-awform': '1' },
    data: { email: EMAILS[compte], password: password() },
  });
  expect(r.status(), await r.text()).toBe(200);
}

/** Nouveau compte adulte (hifẓ : chaque test part d'un carnet vide), connecté dans `page`. */
export async function newAdult(
  page: Page,
  label: string,
  country = 'FR',
): Promise<{ email: string; profileId: string }> {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
  const r = await page.request.post('/api/v1/auth/signup', {
    headers: { 'x-awform': '1' },
    data: {
      kind: 'adulte',
      email,
      password: password(),
      country,
      locale: 'fr',
      birthYear: 1988,
      pseudonym: 'Hafiz',
      // hors de l'Union européenne (Sénégal…) : accord exprès à l'hébergement hors du pays
      consents:
        country === 'FR'
          ? ['cgu', 'donnee_religieuse_art9']
          : ['cgu', 'donnee_religieuse_art9', 'transfert_hors_pays'],
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  const me = (await r.json()) as { profiles: Array<{ id: string }> };
  return { email, profileId: me.profiles[0]!.id };
}

/** dernier pas TOTP utilisé, partagé entre les processus de test (un processus redémarre après un échec) */
const COUNTER_FILE = join(tmpdir(), 'awform-e2e-totp-counter');
function lastCounter(): number {
  try {
    return Number(readFileSync(COUNTER_FILE, 'utf8')) || 0;
  } catch {
    return 0;
  }
}
/** Connexion de l'enseignant de test (second facteur : un code neuf à chaque fois, anti-rejeu). */
export async function loginTeacher(page: Page): Promise<void> {
  const secret = process.env.E2E_TOTP_SECRET;
  if (!secret) throw new Error('E2E_TOTP_SECRET absent');
  const last = Math.max(lastCounter(), Number(process.env.E2E_TOTP_LAST ?? 0));
  let c = Math.max(Math.floor(Date.now() / 30_000), last + 1);
  while (c > Math.floor(Date.now() / 30_000) + 1) await page.waitForTimeout(3000);
  c = Math.max(c, Math.floor(Date.now() / 30_000) - 1);
  writeFileSync(COUNTER_FILE, String(c));
  const r = await page.request.post('/api/v1/auth/login', {
    headers: { 'x-awform': '1' },
    data: { email: 'maitre@e2e.test', password: password(), totp: totp(secret, c) },
  });
  expect(r.status(), await r.text()).toBe(200);
}

export const test = base.extend<{ compte: Compte }>({
  compte: ['adulte', { option: true }],
  page: async ({ page, compte }, use) => {
    if (compte) await login(page, compte);
    await use(page);
  },
});

export { expect };
