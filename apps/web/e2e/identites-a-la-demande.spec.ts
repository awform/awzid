import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Budget de l'appareil de l'élève (18/10/2026) : la page de connexion et les écrans d'identité (Google, numéro
 * WhatsApp, codes de récupération, validation manuelle) ne font PAS partie de la coquille de l'élève. Ils ne sont
 * ni chargés par ses pages d'apprentissage, ni préchargés par le service worker ; ils arrivent à la demande, quand
 * on ouvre la connexion. Marqueurs : clés de traduction propres à ces écrans, gardées telles quelles par la
 * construction (`id.numero_titre` de la page de connexion, `id.codes_compte` des codes de récupération).
 */
const MARQUEURS = ['id.numero_titre', 'id.codes_compte', 'onTelephone'];

function scriptsCharges(page: Page): Map<string, Promise<string>> {
  const vus = new Map<string, Promise<string>>();
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.pathname.endsWith('.js') && u.pathname.includes('/_app/'))
      vus.set(
        u.pathname,
        r.text().catch(() => ''),
      );
  });
  return vus;
}
async function avecMarqueur(vus: Map<string, Promise<string>>): Promise<string[]> {
  const out: string[] = [];
  for (const [p, txt] of vus) {
    const t = await txt;
    if (MARQUEURS.some((m) => t.includes(m))) out.push(p);
  }
  return out;
}

test('pages de l’élève : aucun écran d’identité chargé, ni préchargé par le service worker', async ({
  page,
}) => {
  const vus = scriptsCharges(page);
  for (const url of ['/', '/aujourdhui', '/quotidien', '/lecons/ad1.l01']) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
  }
  expect(await avecMarqueur(vus)).toEqual([]);
  // la liste des fichiers mis à part par le service worker (gardés au premier usage) contient bien ces écrans
  const groupes = (await (await page.request.get('/groupes.json')).json()) as Record<
    string,
    string[]
  >;
  const aPart = new Set(Object.values(groupes).flat());
  const connexion = scriptsCharges(page);
  await page.context().clearCookies();
  await page.goto('/connexion');
  await page.waitForLoadState('networkidle');
  const charges = await avecMarqueur(connexion);
  expect(charges.length, 'la page de connexion charge ses écrans à la demande').toBeGreaterThan(0);
  for (const f of charges) expect(aPart.has(f), `${f} hors de la coquille préchargée`).toBe(true);
});
