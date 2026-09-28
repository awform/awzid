import { expect, test as base, type Page } from '@playwright/test';

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

export const test = base.extend<{ compte: Compte }>({
  compte: ['adulte', { option: true }],
  page: async ({ page, compte }, use) => {
    if (compte) await login(page, compte);
    await use(page);
  },
});

export { expect };
