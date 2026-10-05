import { execFileSync } from 'node:child_process';
import { expect, newAdult, password, test } from './fixtures';
import { solveExercise, unitData } from './solve';
import { totp } from './totp';

/**
 * Lot F1 « contenu robuste » (revue d'architecture M1, E5, G2) dans le navigateur :
 *  - une réponse donnée hors ligne puis REFUSÉE par le serveur n'est pas jetée : elle est gardée sur
 *    l'appareil (« Mes téléchargements »), signalable sans son contenu ;
 *  - « Signaler une erreur » sur un exercice → file de l'administrateur → SUSPENSION D'URGENCE (exercice
 *    masqué chez l'élève, message neutre) → levée.
 * Leçon ad1.l02 (présente dans les vrais livres et dans le contenu synthétique, utilisée par aucun autre test).
 */
const UNIT = 'ad1.l02';
const GRADED = [
  'premiere_lettre',
  'chasse',
  'relier',
  'ecoute',
  'vrai_faux',
  'complete',
  'contient',
  'ordre',
];

test('réponse hors ligne refusée par le serveur : gardée sur l’appareil, signalable', async ({
  page,
  context,
}) => {
  const { unit } = await unitData(page, UNIT);
  const i = unit.lesson.exercices.findIndex((e) => GRADED.includes(e.type));
  await page.goto(`/lecons/${UNIT}`);
  await expect(page.locator('h1')).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await solveExercise(page, unit.exercises[i]!.id, unit.lesson.exercices[i]!);
  await expect(page.getByTestId('en-attente')).toBeVisible();
  // l'événement porte l'édition du contenu affiché ; on simule une version jamais publiée (le serveur la
  // refusera définitivement : c'est le cas que l'ancienne file jetait en silence)
  const queued = await page.evaluate(
    () =>
      new Promise<Array<{ edition?: string; v?: number }>>((resolve, reject) => {
        const req = indexedDB.open('awform');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite');
          const store = tx.objectStore('events');
          const all = store.getAll();
          all.onsuccess = () => {
            const evs = all.result as Array<Record<string, unknown>>;
            for (const e of evs) store.put({ ...e, exerciseHash: 'version-jamais-publiee' });
            tx.oncomplete = () => resolve(evs as Array<{ edition?: string; v?: number }>);
          };
        };
      }),
  );
  expect(queued.length).toBeGreaterThan(0);
  expect(queued[0]).toMatchObject({ v: 2 });
  expect(queued[0]?.edition).toBeTruthy();
  await context.setOffline(false);
  await expect(page.getByTestId('en-attente')).toHaveCount(0, { timeout: 15_000 });

  await page.goto('/hors-ligne');
  const box = page.getByTestId('mises-de-cote');
  await expect(box).toContainText('refusée');
  await expect(box).toContainText('empreinte différente');
  await box.getByRole('button', { name: 'Signaler le problème' }).click();
  await expect(page.getByText('Problème signalé')).toBeVisible();
  // toujours là après un rechargement : rien n'est perdu
  await page.reload();
  await expect(page.getByTestId('mises-de-cote')).toBeVisible();
  await page.getByTestId('mises-de-cote').getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByText('Toujours refusées')).toBeVisible();
});

test('signalement d’un exercice → file de l’administrateur → suspension d’urgence → levée', async ({
  page,
  browser,
}) => {
  // compte neuf (un signalement par bloc et par jour) ; commentaire propre à ce lancement
  await newAdult(page, 'f1-signal');
  const run = `${test.info().project.name}-${Date.now()}`;
  const { unit } = await unitData(page, UNIT);
  const i = unit.lesson.exercices.findIndex((e) => GRADED.includes(e.type));
  const exId = unit.exercises[i]!.id;
  await page.goto(`/lecons/${UNIT}`);
  const ex = page.locator(`section.ex[data-exercise="${exId}"]`);
  await expect(ex).toBeVisible();
  // l'élève (adulte) signale l'exercice : formulaire court, sans donnée personnelle
  const sig = page.locator(`section.ex[data-exercise="${exId}"] + .sig`);
  await sig.getByRole('button', { name: 'Signaler une erreur' }).click();
  const form = sig.getByTestId('signaler-form');
  await expect(form).toContainText('aucune donnée personnelle');
  await form.locator('select').selectOption('corrige');
  await form.locator('textarea').fill(`Réponse attendue douteuse (${run}).`);
  await form.getByRole('button', { name: 'Envoyer' }).click();
  await expect(sig.getByRole('status')).toContainText('Merci');

  // administrateur (créé par l'outil staff, second facteur configuré à la première connexion)
  const email = `admin-f1-${test.info().project.name}@e2e.test`;
  execFileSync(
    process.execPath,
    ['../api/dist/cli/staff.js', '--kind', 'admin', '--email', email, '--test'],
    { env: { ...process.env, AWFORM_STAFF_PASSWORD: password() }, stdio: 'ignore' },
  );
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const adm = await ctx.newPage();
  const login = await adm.request.post('/api/v1/auth/login', {
    headers: { 'x-awform': '1' },
    data: { email, password: password() },
  });
  expect(login.status()).toBe(200);
  const setup = await adm.request.post('/api/v1/auth/totp/setup', {
    headers: { 'x-awform': '1' },
    data: {},
  });
  const { secret } = (await setup.json()) as { secret: string };
  const ok = await adm.request.post('/api/v1/auth/totp/confirm', {
    headers: { 'x-awform': '1' },
    data: { code: totp(secret, Math.floor(Date.now() / 30_000)) },
  });
  expect(ok.status(), await ok.text()).toBe(200);
  await adm.goto('/admin');
  const item = adm.getByTestId('signalement-contenu').filter({ hasText: run });
  await expect(item).toContainText(UNIT);
  await expect(item).not.toContainText('@e2e.test');
  await item.getByRole('button', { name: "Suspendre d'urgence" }).click();
  await expect(adm.getByTestId('suspension')).toHaveCount(1);

  // chez l'élève : l'exercice est masqué partout, message neutre
  await page.reload();
  await expect(page.getByTestId('contenu-suspendu')).toContainText('momentanément retiré');
  await expect(ex).toHaveCount(0);

  // levée par l'administrateur : l'exercice revient
  await adm.getByTestId('suspension').getByRole('button', { name: 'Lever' }).click();
  await expect(adm.getByTestId('suspension')).toHaveCount(0);
  await page.reload();
  await expect(ex).toBeVisible();
  await expect(page.getByTestId('contenu-suspendu')).toHaveCount(0);
  await ctx.close();
});
