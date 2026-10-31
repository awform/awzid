import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

/**
 * « Voir le tracé » (31/10/2026) : depuis l'Écriture, ouvrir une lettre, lancer à 0,5× et vérifier que l'animation
 * avance (plus lentement qu'à 1×) ; mention « à confirmer » pour une forme probable ; animations réduites : aucun
 * démarrage automatique.
 */
test.use({ compte: null });

const TRAITS = JSON.parse(
  readFileSync(new URL('../static/video/traits.json', import.meta.url), 'utf8'),
) as Record<string, Array<{ s: string } | null>>;
const probable = Object.entries(TRAITS).flatMap(([l, fs]) =>
  l === '_' ? [] : fs.flatMap((f, i) => (f?.s === 'probable' ? [{ l, i }] : [])),
)[0]!;
const FORMES = ['isolee', 'debut', 'milieu', 'fin'];

test('Ecriture : Voir le tracé, lancé à 0,5×, l’animation avance', async ({ page }) => {
  await page.goto('/ecriture');
  await page.locator('[data-testid="lettres"] [data-lettre="ب"]').click();
  await page.locator('[data-forme="debut"]').click();
  await page.getByTestId('voir-trace').click();
  await expect(page).toHaveURL(/\/ecriture\/trace\?lettre=/);
  const anim = page.getByTestId('trace-lettre');
  await expect(anim).toHaveAttribute('data-lettre', 'ب');
  await expect(anim).toHaveAttribute('data-forme', 'debut');
  await expect(page.getByTestId('ligne-de-base')).toBeAttached();
  expect((await page.getByTestId('ligne-de-base').boundingBox())!.width).toBeGreaterThan(50);
  await expect(page.getByTestId('fleche-depart').first()).toBeAttached();
  await expect(page.getByTestId('trace-a-confirmer')).toHaveCount(0);

  await page.locator('[data-vitesse="0.5"]').click();
  await expect(anim).toHaveAttribute('data-vitesse', '0.5');
  await page.getByTestId('trace-rejouer').click();
  const t0 = Date.now();
  await expect.poll(async () => Number(await anim.getAttribute('data-t'))).toBeGreaterThan(150);
  const avance = Number(await anim.getAttribute('data-t'));
  // 0,5× : l'avancement (à 1×) reste inférieur au temps réel écoulé
  expect(avance).toBeLessThan(Date.now() - t0 + 100);
  await expect(anim).toHaveAttribute('data-jouant', 'true');
  await page.getByTestId('trace-lire').click();
  await expect(anim).toHaveAttribute('data-jouant', 'false');
});

test('Voir le tracé : forme « probable » = mention à confirmer ; planche de toutes les lettres', async ({
  page,
}) => {
  await page.goto(
    `/ecriture/trace?lettre=${encodeURIComponent(probable.l)}&forme=${FORMES[probable.i]}`,
  );
  await expect(page.getByTestId('trace-lettre')).toHaveAttribute('data-statut', 'probable');
  await expect(page.getByTestId('trace-a-confirmer')).toBeVisible();
  await expect(page.getByTestId('planche').locator('li')).toHaveCount(
    Object.keys(TRAITS).length - 1,
  );
  // une autre lettre depuis la planche
  await page.locator('[data-testid="planche"] [data-lettre="ن"]').click();
  await expect(page.getByTestId('trace-lettre')).toHaveAttribute('data-lettre', 'ن');
});

test('animations réduites : pas de démarrage automatique, Lire disponible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/ecriture/trace?lettre=%D8%A8&forme=isolee');
  const anim = page.getByTestId('trace-lettre');
  await expect(anim).toBeVisible();
  await page.waitForTimeout(600);
  await expect(anim).toHaveAttribute('data-jouant', 'false');
  const fin = Number(await anim.getAttribute('data-t'));
  expect(fin).toBeGreaterThan(0);
  await page.getByTestId('trace-lire').click();
  await expect(anim).toHaveAttribute('data-jouant', 'true');
});
