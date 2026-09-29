import { randomUUID } from 'node:crypto';
import { expect, test } from './fixtures';

/**
 * Lot 15 — interface anglaise (langue « en préparation », montrée seulement si le serveur l'autorise),
 * activités « racines » (éléments tirés des livres gelés) et « j'enseigne une lettre à mon parent »
 * (rien n'est enregistré).
 */
test.describe('adulte', () => {
  test('anglais : proposé seulement comme langue en préparation, pages légales et aide traduites', async ({
    page,
  }) => {
    const cfg = await (await page.request.get('/api/v1/config')).json();
    expect(cfg.languesEnPreparation).toBe(true);
    await page.goto('/compte');
    await expect(page.locator('[data-locale="en"]')).toHaveCount(0);
    await page.getByTestId('langues-preparation').check();
    await Promise.all([page.waitForEvent('load'), page.locator('[data-locale="en"]').click()]);
    await page.goto('/aujourdhui');
    await expect(page.locator('h1')).toContainText('Today');
    await expect(page.locator('[data-tab="arabe"]')).toContainText('Arabic');
    await page.getByTestId('pied').getByRole('link', { name: 'Privacy' }).click();
    await expect(page.getByTestId('page-legale')).toContainText('Privacy policy');
    await expect(page.getByTestId('page-legale')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('page-legale')).toContainText('native speaker');
    await page.goto('/aide');
    await expect(page.locator('main')).toContainText('Getting started');
    // retour au français
    await page.goto('/compte');
    await Promise.all([page.waitForEvent('load'), page.locator('[data-locale="fr"]').click()]);
    await page.goto('/aujourdhui');
    await expect(page.locator('h1')).toContainText('Aujourd');
  });

  test('racines : racine + schème → pluriel, éléments tirés du livre', async ({ page }) => {
    await page.goto('/activites/racines');
    const jeu = page.getByTestId('racine');
    await expect(jeu).toBeVisible();
    const n = await page.locator('[data-item]').count();
    expect(n).toBe(1);
    // première carte : ك ت ب + فُعُلٌ → كُتُبٌ
    await expect(page.getByTestId('racine-lettres')).toHaveText('ك ت ب');
    await page.locator('[data-option="أَوْلَادٌ"]').click();
    await expect(page.getByTestId('racine-retour')).toContainText('Pas encore');
    await page.locator('[data-option="كُتُبٌ"]').click();
    await expect(page.getByTestId('racine-retour')).toContainText('Oui');
    await expect(jeu).toContainText('AD2');
    await page.getByTestId('racine-suivant').click();
    for (let k = 0; k < 3; k++) {
      const item = page.getByTestId('racine');
      const plural = {
        'ktb-fuul': 'كُتُبٌ',
        'ktb-mafail': 'مَكَاتِبُ',
        'byt-fuul': 'بُيُوتٌ',
        'qlm-afal': 'أَقْلَامٌ',
      }[(await item.getAttribute('data-item')) ?? '']!;
      await page.locator(`[data-option="${plural}"]`).click();
      await page.getByTestId('racine-suivant').click();
    }
    await expect(page.getByTestId('racine-fin')).toContainText('4 mots construits');
  });
});

test.describe('parent', () => {
  test.use({ compte: 'parent' });
  test('j’enseigne une lettre à mon parent : l’enfant montre, le parent coche, rien n’est envoyé', async ({
    page,
  }) => {
    const me = await (await page.request.get('/api/v1/auth/me')).json();
    const amina = me.profiles.find((p: { pseudonym: string }) => p.pseudonym === 'Amina');
    const day = new Date().toISOString().slice(0, 10);
    const r = await page.request.post('/api/v1/attempts', {
      headers: { 'x-awform': '1' },
      data: {
        events: [
          {
            id: randomUUID(),
            profileId: amina.id,
            unitId: 'entrainement',
            eventType: 'trace',
            deviceAt: new Date().toISOString(),
            response: { item: 'ب:isolee', ok: true, day, details: { etape: 3 } },
          },
        ],
      },
    });
    expect(r.ok()).toBe(true);
    await page.goto('/profils');
    await page.locator('[data-profile]').filter({ hasText: 'Amina' }).click();
    await page.goto('/aujourdhui');
    await page.getByTestId('activites').getByRole('link').first().click();
    await page.locator('[data-lettre="ب"]').click();
    const posts: string[] = [];
    page.on('request', (q) => {
      if (q.method() !== 'GET') posts.push(q.url());
    });
    await expect(page.getByTestId('enseigner-fini')).toBeDisabled();
    for (const e of ['montre', 'nomme', 'trace', 'mot'])
      await page.locator(`[data-coche="${e}"]`).check();
    await page.getByTestId('enseigner-fini').click();
    await expect(page.getByTestId('enseigner-bravo')).toContainText('Amina');
    expect(posts).toEqual([]);
  });
});
