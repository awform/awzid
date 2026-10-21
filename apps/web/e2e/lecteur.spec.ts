import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { listen } from './coran';
import { expect, newAdult, test } from './fixtures';

/**
 * Lecteur audio des phrases (19/10/2026) : discret, apparaît SEULEMENT après un appui sur « Écouter » (leçons, lectures,
 * Madjaliss, douas), fixé en bas au-dessus de la barre de navigation, fermable. Pause / lecture, reculer et avancer de
 * 5 s, barre de progression (audio de plus de 20 s seulement), phrase précédente et suivante, boucle (10 répétitions),
 * vitesses 0,75 / 1 / 1,25 (voix à la même hauteur), lecture continue avec surlignage, commandes de l'écran verrouillé.
 * Chargé à la demande (import dynamique) ; aucune lecture automatique. Les MP3 sont remplacés par des sons silencieux
 * de durée connue (courts : 0,8 s ; longs : 25 s) pour des essais rapides et déterministes ; la lecture, elle, est réelle.
 * Captures avec LECTEUR_CAPTURES_DIR=<dossier> (téléphone, clair et sombre).
 */
test.skip(!process.env.E2E_LECONS_AUDIO, 'audio des leçons absent (~/lecons-audio)');

const CAP = process.env.LECTEUR_CAPTURES_DIR;
const mobile = (name: string) => name.startsWith('mobile');

/** Son silencieux au format WAV (PCM 8 kHz, 16 bits) de `sec` secondes. */
function wav(sec: number): Buffer {
  const rate = 8000;
  const n = Math.round(sec * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  return b;
}

/** Remplace tous les MP3 par un son silencieux (avec « Range », comme le serveur) ; renvoie le réglage de durée. */
async function sons(page: Page) {
  const etat = { sec: 0.8 };
  await page.route(/\.mp3(\?.*)?$/, async (route) => {
    const corps = wav(etat.sec);
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers()['range'] ?? '');
    if (!range)
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'audio/wav', 'accept-ranges': 'bytes' },
        body: corps,
      });
    const a = Number(range[1]);
    const z = range[2] ? Math.min(Number(range[2]), corps.length - 1) : corps.length - 1;
    return route.fulfill({
      status: 206,
      headers: {
        'content-type': 'audio/wav',
        'accept-ranges': 'bytes',
        'content-range': `bytes ${a}-${z}/${corps.length}`,
      },
      body: corps.subarray(a, z + 1),
    });
  });
  return etat;
}

/** Espions : éléments audio créés, lectures lancées, commandes de l'écran verrouillé enregistrées. */
async function espions(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const Orig = window.Audio;
    w.__audios = [] as HTMLAudioElement[];
    const Espion = function (this: unknown, ...a: ConstructorParameters<typeof Audio>) {
      const x = new Orig(...a) as HTMLAudioElement & { __plays?: number };
      x.__plays = 0;
      x.addEventListener('play', () => (x.__plays = (x.__plays ?? 0) + 1));
      (w.__audios as unknown[]).push(x);
      return x;
    } as unknown as typeof Audio;
    Espion.prototype = Orig.prototype;
    window.Audio = Espion;
    w.__ms = {} as Record<string, boolean>;
    const ms = navigator.mediaSession;
    if (ms) {
      const orig = ms.setActionHandler.bind(ms);
      ms.setActionHandler = (a: MediaSessionAction, f: MediaSessionActionHandler | null) => {
        (w.__ms as Record<string, boolean>)[a] = !!f;
        orig(a, f);
      };
    }
  });
}
const audio = <T>(page: Page, f: (a: HTMLAudioElement & { __plays?: number }) => T) =>
  page.evaluate(`(${f.toString()})(window.__audios[window.__audios.length - 1])`) as Promise<T>;

const region = (page: Page) => page.getByRole('region', { name: 'Lecteur audio' });
const jouer = (page: Page) => page.getByTestId('lecteur-jouer');

/** « Régler » : déplie le lecteur (réduit par défaut, 21/10/2026) s'il ne l'est pas déjà. */
async function deplier(page: Page) {
  const r = page.getByTestId('lecteur');
  await expect(r).toBeVisible();
  if ((await r.getAttribute('data-deplie')) !== 'true')
    await page.getByTestId('lecteur-regler').click();
  await expect(r).toHaveAttribute('data-deplie', 'true');
}

async function ouvrirLecon(page: Page): Promise<{ n: number; premier: Locator }> {
  await page.goto('/lecons/en1.l01');
  const boutons = page.locator('[data-lecteur="l"][data-audio]:visible');
  await expect(boutons.first()).toBeVisible();
  const n = await boutons.count();
  expect(n).toBeGreaterThan(3);
  return { n, premier: boutons.first() };
}

test('chargé à la demande : rien avant l’appui sur « Écouter », aucune lecture automatique, le lecteur apparaît ensuite', async ({
  page,
}) => {
  await sons(page);
  await espions(page);
  const demandes: string[] = [];
  page.on('request', (r) => demandes.push(new URL(r.url()).pathname));
  const { premier } = await ouvrirLecon(page);
  await page.waitForTimeout(800);
  const fichiers = (await (await page.request.get('/_app/lecteur.json')).json()) as string[];
  expect(fichiers.length).toBeGreaterThanOrEqual(2); // le code (JS) et son style (CSS)
  expect(fichiers.some((f) => f.endsWith('.js'))).toBe(true);
  // avant l'appui : ni code du lecteur, ni son, ni lecteur
  expect(demandes.filter((d) => fichiers.includes(d))).toEqual([]);
  expect(demandes.filter((d) => d.includes('/lecons-audio/fichiers/'))).toEqual([]);
  await expect(region(page)).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { __audios: unknown[] }).__audios.length),
  ).toBe(0);
  await premier.click();
  await expect(region(page)).toBeVisible();
  expect(demandes.filter((d) => fichiers.includes(d)).length).toBe(fichiers.length);
  await expect(jouer(page)).toHaveAccessibleName(/Mettre en pause|Lire/);
  await expect.poll(() => audio(page, (a) => a.__plays)).toBeGreaterThanOrEqual(1);
});

test('commandes : cibles de 44 px, libellés, phrase suivante et précédente dans l’ordre de la page, surlignage', async ({
  page,
}) => {
  await sons(page);
  await espions(page);
  const { n, premier } = await ouvrirLecon(page);
  await premier.click();
  const r = region(page);
  await expect(r).toBeVisible();
  await expect(page.getByTestId('lecteur-etat')).toHaveText(`Phrase 1 sur ${n}`);
  await deplier(page);
  // chaque bouton : 44 px au moins, nom accessible
  const boutons = r.getByRole('button');
  const total = await boutons.count();
  expect(total).toBeGreaterThanOrEqual(10);
  for (let i = 0; i < total; i++) {
    const b = boutons.nth(i);
    const box = await b.boundingBox();
    expect(box!.width, await b.getAttribute('aria-label')).toBeGreaterThanOrEqual(44);
    expect(box!.height, await b.getAttribute('aria-label')).toBeGreaterThanOrEqual(44);
    await expect(b).toHaveAccessibleName(/.+/);
  }
  for (const nom of [
    'Phrase précédente',
    'Reculer de 5 secondes',
    'Avancer de 5 secondes',
    'Phrase suivante',
    'Répéter la phrase en boucle',
    'Lecture continue',
    'Fermer le lecteur',
    'Replier le lecteur',
  ])
    await expect(r.getByRole('button', { name: nom })).toBeVisible();
  await expect(r.getByRole('button', { name: 'Phrase précédente' })).toBeDisabled();
  // la phrase en cours est surlignée et reste visible, au-dessus du lecteur
  await expect(page.locator('.lecteur-actif')).toHaveCount(1);
  await expect(premier).toHaveAttribute('aria-pressed', /true|false/);
  const premiere = await page.locator('.lecteur-actif').evaluate((e) => e.textContent);
  await r.getByRole('button', { name: 'Phrase suivante' }).click();
  await expect(page.getByTestId('lecteur-etat')).toHaveText(`Phrase 2 sur ${n}`);
  await expect(page.locator('.lecteur-actif')).toHaveCount(1);
  await expect(page.locator('.lecteur-actif')).toBeInViewport();
  // (défilement doux : on attend qu'il soit fini) la phrase finit au-dessus du lecteur
  await expect
    .poll(async () => {
      const haut = (await r.boundingBox())!.y;
      const bas = (await page.locator('.lecteur-actif').boundingBox())!;
      return bas.y + bas.height <= haut + 1;
    })
    .toBe(true);
  expect(await page.locator('.lecteur-actif').evaluate((e) => e.textContent)).not.toBe(premiere);
  await r.getByRole('button', { name: 'Phrase précédente' }).click();
  await expect(page.getByTestId('lecteur-etat')).toHaveText(`Phrase 1 sur ${n}`);
  // c'est bien le fichier de la phrase 1 qui joue
  await expect
    .poll(() => audio(page, (a) => a.src))
    .toContain((await premier.getAttribute('data-audio'))!);
});

test('vitesses 0,75 / 1 / 1,25 : la hauteur de la voix est conservée, y compris à la phrase suivante', async ({
  page,
}) => {
  await sons(page);
  await espions(page);
  const { premier } = await ouvrirLecon(page);
  await premier.click();
  const r = region(page);
  await deplier(page);
  for (const [nom, v] of [
    ['Vitesse 0,75×', 0.75],
    ['Vitesse 1,25×', 1.25],
    ['Vitesse 1×', 1],
  ] as const) {
    await r.getByRole('button', { name: nom }).click();
    await expect(r.getByRole('button', { name: nom })).toHaveAttribute('aria-pressed', 'true');
    expect(await audio(page, (a) => [a.playbackRate, a.preservesPitch])).toEqual([v, true]);
  }
  await r.getByRole('button', { name: 'Vitesse 1,25×' }).click();
  await r.getByRole('button', { name: 'Phrase suivante' }).click();
  await expect
    .poll(() => audio(page, (a) => [a.playbackRate, a.preservesPitch]))
    .toEqual([1.25, true]);
});

test('pause et reprise au même endroit, reculer / avancer de 5 s, barre de progression glissable (audio de plus de 20 s)', async ({
  page,
}) => {
  const duree = await sons(page);
  duree.sec = 25;
  await espions(page);
  const { premier } = await ouvrirLecon(page);
  await premier.click();
  const r = region(page);
  await deplier(page);
  const barre = page.getByTestId('lecteur-barre');
  await expect(barre).toBeVisible({ timeout: 10_000 });
  await expect(barre.getByRole('slider')).toHaveAccessibleName('Position dans l’audio');
  // avancer de 5 s
  const t0 = await audio(page, (a) => a.currentTime);
  await r.getByRole('button', { name: 'Avancer de 5 secondes' }).click();
  const t1 = await audio(page, (a) => a.currentTime);
  expect(t1 - t0).toBeGreaterThanOrEqual(4.5);
  await r.getByRole('button', { name: 'Reculer de 5 secondes' }).click();
  const t2 = await audio(page, (a) => a.currentTime);
  expect(t1 - t2).toBeGreaterThanOrEqual(4.5);
  // barre glissable
  await barre.getByRole('slider').fill('20');
  await expect.poll(() => audio(page, (a) => Math.round(a.currentTime))).toBeGreaterThanOrEqual(20);
  // pause : le bouton devient « Lire », l'audio s'arrête ; reprise exactement là (sans retour au début)
  await jouer(page).click();
  await expect(jouer(page)).toHaveAccessibleName('Lire');
  expect(await audio(page, (a) => a.paused)).toBe(true);
  const tp = await audio(page, (a) => a.currentTime);
  await page.waitForTimeout(600);
  expect(await audio(page, (a) => a.currentTime)).toBe(tp);
  await jouer(page).click();
  await expect(jouer(page)).toHaveAccessibleName('Mettre en pause');
  const tr = await audio(page, (a) => a.currentTime);
  expect(tr).toBeGreaterThanOrEqual(tp);
  expect(tr).toBeLessThan(tp + 2);
});

test('audio de 20 s ou moins : pas de barre de progression', async ({ page }) => {
  const duree = await sons(page);
  duree.sec = 5;
  await espions(page);
  const { premier } = await ouvrirLecon(page);
  await premier.click();
  await expect(region(page)).toBeVisible();
  await expect.poll(() => audio(page, (a) => Number.isFinite(a.duration))).toBe(true);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('lecteur-barre')).toHaveCount(0);
});

test('boucle : la phrase se répète, arrêt automatique après 10 répétitions', async ({ page }) => {
  test.setTimeout(120_000);
  const duree = await sons(page);
  duree.sec = 1.5;
  await espions(page);
  const { premier } = await ouvrirLecon(page);
  await premier.click();
  const r = region(page);
  await deplier(page);
  await r.getByRole('button', { name: 'Répéter la phrase en boucle' }).click();
  await expect(r.getByRole('button', { name: 'Répéter la phrase en boucle' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('lecteur-rep')).toContainText('Répétition');
  // arrêt automatique : 1 lecture + 10 répétitions, puis plus rien
  await expect(jouer(page)).toHaveAccessibleName('Lire', { timeout: 30_000 });
  await expect(r.getByRole('button', { name: 'Répéter la phrase en boucle' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(await audio(page, (a) => a.__plays)).toBe(11);
  await page.waitForTimeout(1200);
  expect(await audio(page, (a) => a.__plays)).toBe(11);
});

test('lecture continue : enchaîne les phrases de la page, surligne la phrase en cours et la garde dans la vue', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const duree = await sons(page);
  duree.sec = 0.6;
  await espions(page);
  const { n, premier } = await ouvrirLecon(page);
  await premier.click();
  const r = region(page);
  // sans « lecture continue », une phrase finie ne lance pas la suivante
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __audios: HTMLAudioElement[] }).__audios.at(-1)?.ended === true,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  await expect(jouer(page)).toHaveAccessibleName('Lire');
  await expect(page.getByTestId('lecteur-etat')).toHaveText(`Phrase 1 sur ${n}`);
  await deplier(page);
  await r.getByRole('button', { name: 'Lecture continue' }).click();
  await expect(r.getByRole('button', { name: 'Lecture continue' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await jouer(page).click(); // relance la phrase 1, puis l'enchaînement commence
  for (const k of [2, 3, 4]) {
    await expect(page.getByTestId('lecteur-etat')).toHaveText(new RegExp(`^Phrase ${k} sur ${n}`), {
      timeout: 15_000,
    });
    await expect(page.locator('.lecteur-actif')).toHaveCount(1);
    await expect(page.locator('.lecteur-actif')).toBeInViewport();
  }
});

test('écran verrouillé et écouteurs : Media Session avec le titre de la leçon', async ({
  page,
}) => {
  await sons(page);
  await espions(page);
  const { premier } = await ouvrirLecon(page);
  await premier.click();
  await expect(region(page)).toBeVisible();
  const titre = await page.evaluate(() => navigator.mediaSession.metadata?.title ?? '');
  expect(titre.length).toBeGreaterThan(2);
  const h1 = (await page.locator('h1').first().textContent())!.replace(/\s+/g, ' ').trim();
  expect(titre).toBe(h1);
  const ms = await page.evaluate(
    () => (window as unknown as { __ms: Record<string, boolean> }).__ms,
  );
  expect(ms).toEqual({
    play: true,
    pause: true,
    previoustrack: true,
    nexttrack: true,
    seekbackward: true,
    seekforward: true,
  });
});

test('fermer : le lecteur disparaît, la lecture s’arrête, le surlignage et l’état du bouton sont retirés (Échap aussi)', async ({
  page,
}) => {
  const duree = await sons(page);
  duree.sec = 25;
  await espions(page);
  const { premier } = await ouvrirLecon(page);
  await premier.click();
  await expect(region(page)).toBeVisible();
  await expect(page.locator('.lecteur-actif')).toHaveCount(1);
  await deplier(page);
  await page.getByTestId('lecteur-fermer').click();
  await expect(region(page)).toHaveCount(0);
  await expect(page.locator('.lecteur-actif')).toHaveCount(0);
  await expect(premier).not.toHaveClass(/playing/);
  expect(await audio(page, (a) => a.paused)).toBe(true);
  expect(await page.evaluate(() => document.body.style.paddingBottom)).toBe('');
  // un nouvel appui rouvre le lecteur (déplié : choix gardé) ; Échap (focus dans le lecteur) le replie, puis le ferme
  await premier.click();
  await expect(region(page)).toHaveAttribute('data-deplie', 'true');
  await jouer(page).focus();
  await page.keyboard.press('Escape');
  await expect(region(page)).toHaveAttribute('data-deplie', 'false');
  await expect(page.getByTestId('lecteur-regler')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(region(page)).toHaveCount(0);
});

test('clavier : Tab atteint les commandes, Entrée / Espace les actionnent', async ({ page }) => {
  const duree = await sons(page);
  duree.sec = 25;
  await espions(page);
  const { premier } = await ouvrirLecon(page);
  await premier.click();
  await expect(region(page)).toBeVisible();
  // réduit : Tab va de lecture / pause à « Régler » ; Entrée déplie, le focus passe au « × » ; Échap replie
  await jouer(page).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('lecteur-regler')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('lecteur-replier')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('lecteur-regler')).toBeFocused();
  await expect(page.getByTestId('lecteur-regler')).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await expect(region(page)).toHaveAttribute('data-deplie', 'true');
  await jouer(page).focus();
  await page.keyboard.press('Enter');
  await expect(jouer(page)).toHaveAccessibleName('Lire');
  await page.keyboard.press('Space');
  await expect(jouer(page)).toHaveAccessibleName('Mettre en pause');
  await page.keyboard.press('Tab'); // → avancer de 5 s
  await expect(page.getByRole('button', { name: 'Avancer de 5 secondes' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Phrase suivante' })).toBeFocused();
});

test('téléphone : le lecteur est fixé AU-DESSUS de la barre de navigation, sans la cacher', async ({
  page,
}, info) => {
  test.skip(!mobile(info.project.name), 'barre de navigation du bas : téléphone seulement');
  await sons(page);
  const { premier } = await ouvrirLecon(page);
  await premier.click();
  const r = (await region(page).boundingBox())!;
  const nav = (await page.locator('nav.tabs').boundingBox())!;
  expect(r.y + r.height).toBeLessThanOrEqual(nav.y + 1);
  expect(r.y + r.height).toBeGreaterThan(nav.y - 12);
  // ne dépasse pas de l'écran, et le contenu de la page reste atteignable derrière lui
  const vue = page.viewportSize()!;
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.x + r.width).toBeLessThanOrEqual(vue.width);
  // réduit : une pastille dans le coin, pas un panneau sur toute la largeur
  expect(r.width).toBeLessThan(160);
  expect(r.x + r.width).toBeGreaterThan(vue.width - 40);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const pied = await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom));
  expect(pied).toBeGreaterThan(40);
  expect(pied).toBeGreaterThanOrEqual(r.height);
});

test('réduit par défaut : « Régler » déplie, « × » et un toucher ailleurs replient, le choix est gardé sur l’appareil', async ({
  page,
}) => {
  const duree = await sons(page);
  duree.sec = 25;
  const { premier } = await ouvrirLecon(page);
  await premier.click();
  const r = region(page);
  await expect(r).toHaveAttribute('data-deplie', 'false');
  // seulement lecture / pause et « Régler »
  await expect(r.getByRole('button')).toHaveCount(2);
  for (const id of ['lecteur-recul', 'lecteur-suivante', 'lecteur-boucle', 'lecteur-barre'])
    await expect(page.getByTestId(id)).toHaveCount(0);
  const regler = page.getByTestId('lecteur-regler');
  await expect(regler).toHaveAccessibleName('Régler le lecteur');
  await expect(regler).toHaveAttribute('aria-expanded', 'false');
  const garde = () => page.evaluate(() => localStorage.getItem('awzid.lecteur.deplie'));
  await regler.click();
  await expect(r).toHaveAttribute('data-deplie', 'true');
  for (const id of ['lecteur-recul', 'lecteur-suivante', 'lecteur-boucle', 'lecteur-continu'])
    await expect(page.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId('lecteur-vitesse-0.75')).toBeVisible();
  await expect(page.getByTestId('lecteur-replier')).toBeFocused();
  expect(await garde()).toBe('1');
  await page.getByTestId('lecteur-replier').click();
  await expect(r).toHaveAttribute('data-deplie', 'false');
  await expect(regler).toBeFocused();
  expect(await garde()).toBe('0');
  // un toucher ailleurs replie, sans changer le choix gardé
  await regler.click();
  await page.locator('h1').first().click();
  await expect(r).toHaveAttribute('data-deplie', 'false');
  expect(await garde()).toBe('1');
  // choix gardé : à la prochaine ouverture, le lecteur s'ouvre déplié
  await page.reload();
  await page.locator('[data-lecteur="l"][data-audio]:visible').first().click();
  await expect(region(page)).toHaveAttribute('data-deplie', 'true');
});

test('exercice « écoute » : pastille réduite, seulement pendant la lecture, sans « Régler »', async ({
  page,
}) => {
  const duree = await sons(page);
  duree.sec = 1.5;
  await espions(page);
  await page.goto('/lecons/en1.l01');
  // même si l'élève a choisi le lecteur déplié ailleurs
  await page.evaluate(() => localStorage.setItem('awzid.lecteur.deplie', '1'));
  const q = page.locator('[data-type="ecoute"] li[data-item="0"]').getByTestId('ecouter').first();
  await q.click();
  const r = region(page);
  await expect(r).toBeVisible();
  await expect(r).toHaveAttribute('data-deplie', 'false');
  await expect(page.getByTestId('lecteur-regler')).toHaveCount(0);
  await expect(r.getByRole('button')).toHaveCount(1);
  const box = (await r.boundingBox())!;
  expect(box.width).toBeLessThan(100);
  // la phrase finie : la pastille disparaît, la page ne lui réserve plus de place
  await expect(r).toBeHidden({ timeout: 10_000 });
  expect(await page.evaluate(() => document.body.style.paddingBottom)).toBe('');
  // « Écouter » de nouveau : elle revient pendant la lecture
  await q.click();
  await expect(r).toBeVisible();
  await expect(jouer(page)).toHaveAccessibleName('Mettre en pause');
  // pause depuis la pastille : elle disparaît
  await jouer(page).click();
  await expect(r).toBeHidden();
});

test('contraste et accessibilité (WCAG AA) : lecteur ouvert, thème clair et sombre', async ({
  page,
}) => {
  await sons(page);
  const { premier } = await ouvrirLecon(page);
  for (const mode of ['clair', 'sombre'] as const) {
    await page.emulateMedia({ colorScheme: mode === 'sombre' ? 'dark' : 'light' });
    await page.evaluate((m) => {
      localStorage.setItem('awzid.mode', m);
      localStorage.removeItem('awzid.lecteur.deplie');
    }, mode);
    await page.reload();
    await premier.waitFor();
    await page.locator('[data-lecteur="l"][data-audio]:visible').first().click();
    await expect(region(page)).toBeVisible();
    const axe = async (etat: string) => {
      const r = await new AxeBuilder({ page })
        .include('[data-testid="lecteur"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        r.violations.map(
          (v) => `${mode} ${etat} ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join('|')}`,
        ),
      ).toEqual([]);
    };
    await axe('réduit');
    await deplier(page);
    await page.getByRole('button', { name: 'Lecture continue' }).click(); // un état « actif » est aussi contrôlé
    await axe('déplié');
    // texte surligné (phrase en cours) : contraste contrôlé aussi
    const s = await new AxeBuilder({ page })
      .include('.lecteur-actif')
      .withTags(['wcag2aa'])
      .analyze();
    expect(s.violations.map((v) => `${mode} ${v.id}`)).toEqual([]);
  }
});

test('Coran : le lecteur du Coran garde pause, précédent, suivant, vitesse et gagne reculer / avancer de 5 s', async ({
  page,
}) => {
  await page.goto('/coran/lecteur?page=604');
  await expect(page.locator('[data-page="604"]')).toBeVisible();
  await listen(page);
  await expect(page.getByTestId('position')).toContainText('Verset 1');
  const recul = page.getByTestId('recul-5');
  const avance = page.getByTestId('avance-5');
  await expect(recul).toHaveAccessibleName('Reculer de 5 secondes');
  await expect(avance).toHaveAccessibleName('Avancer de 5 secondes');
  for (const b of [recul, avance])
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // pause, reprise
  await page.getByTestId('jouer').click();
  expect(
    await page
      .locator('[data-testid="lecteur-audio"] audio')
      .evaluate((a: HTMLAudioElement) => a.paused),
  ).toBe(true);
  await page.getByTestId('jouer').click();
  // reculer au début du verset ne casse rien ; avancer de 5 s dépasse un verset d'essai (0,6 s) : on passe au suivant
  await recul.click();
  await avance.click();
  await expect(page.getByTestId('position')).toContainText(/Verset [2-9]/, { timeout: 5000 });
  // vitesse (réglages d'écoute) toujours là
  await page.getByTestId('ouvrir-reglages').click();
  await expect(page.getByTestId('vitesse')).toBeVisible();
});

test.describe('Madjaliss et douas', () => {
  test.use({ compte: null });

  test('séance de Madjaliss : « Écouter » ouvre le lecteur, les phrases s’enchaînent dans l’ordre de la séance', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const duree = await sons(page);
    duree.sec = 0.6;
    await espions(page);
    await newAdult(page, 'lecteur-mj');
    await page.goto('/madjaliss/akhdari/1');
    await expect(page.getByTestId('mj-etape')).toHaveAttribute('data-etape', 'lire');
    const boutons = page.locator('[data-lecteur="m"][data-audio]:visible');
    await expect(boutons.first()).toBeVisible();
    const n = await boutons.count();
    expect(n).toBeGreaterThan(1);
    await expect(region(page)).toHaveCount(0);
    await boutons.first().click();
    await expect(region(page)).toBeVisible();
    await expect(page.getByTestId('lecteur-etat')).toHaveText(`Phrase 1 sur ${n}`);
    // la phrase surlignée est la fiche de la phrase (data-phrase) du bouton
    const fiche = boutons.first().locator('xpath=ancestor::*[@data-phrase][1]');
    await expect(fiche).toHaveClass(/lecteur-actif/);
    await jouer(page).waitFor();
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __audios: HTMLAudioElement[] }).__audios.at(-1)?.ended ===
              true,
          ),
        { timeout: 15_000 },
      )
      .toBe(true);
    await expect(jouer(page)).toHaveAccessibleName('Lire');
    await deplier(page);
    await page.getByRole('button', { name: 'Lecture continue' }).click();
    await jouer(page).click();
    await expect(page.getByTestId('lecteur-etat')).toHaveText(new RegExp(`^Phrase 2 sur ${n}`), {
      timeout: 15_000,
    });
    await expect(page.locator('[data-phrase].lecteur-actif')).toHaveCount(1);
    expect(await audio(page, (a) => a.src)).toMatch(/^blob:/);
    await page.getByTestId('lecteur-fermer').click();
    await expect(page.locator('.lecteur-actif')).toHaveCount(0);
  });

  test('douas : « Écouter » ouvre le lecteur, pause au second appui, phrase suivante', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const duree = await sons(page);
    duree.sec = 25;
    await espions(page);
    await newAdult(page, 'lecteur-douas');
    await page.goto('/vivre/douas?r=repas');
    const boutons = page.getByTestId('douas-ecouter');
    await expect(boutons.first()).toBeVisible();
    const n = await boutons.count();
    await expect(region(page)).toHaveCount(0);
    await boutons.first().click();
    await expect(region(page)).toBeVisible();
    await expect(page.getByTestId('lecteur-etat')).toHaveText(`Phrase 1 sur ${n}`);
    await expect(boutons.first().locator('xpath=ancestor::*[@data-doua][1]')).toHaveClass(
      /lecteur-actif/,
    );
    await expect(boutons.first()).toHaveClass(/playing/);
    // second appui sur la phrase qui joue : pause
    await boutons.first().click();
    await expect(jouer(page)).toHaveAccessibleName('Lire');
    if (n > 1) {
      await deplier(page);
      await page.getByRole('button', { name: 'Phrase suivante' }).click();
      await expect(page.getByTestId('lecteur-etat')).toHaveText(`Phrase 2 sur ${n}`);
    }
  });
});

test('captures du lecteur sur téléphone (clair et sombre) : leçon, séance de Madjaliss, douas', async ({
  page,
}, info) => {
  test.skip(!CAP || !mobile(info.project.name), 'captures : LECTEUR_CAPTURES_DIR et téléphone');
  test.setTimeout(240_000);
  mkdirSync(CAP!, { recursive: true });
  await page.setViewportSize({ width: 375, height: 812 });
  const duree = await sons(page);
  duree.sec = 25;
  await newAdult(page, 'lecteur-cap');
  for (const mode of ['clair', 'sombre'] as const) {
    await page.emulateMedia({ colorScheme: mode === 'sombre' ? 'dark' : 'light' });
    await page.addInitScript((m) => localStorage.setItem('awzid.mode', m), mode);
    const photo = async (nom: string) => {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(900);
      await page.screenshot({ path: join(CAP!, `${mode}-${nom}.png`) });
    };
    // leçon
    await page.goto('/lecons/en1.l01');
    const l = page.locator('[data-lecteur="l"][data-audio]:visible');
    await l.nth(1).scrollIntoViewIfNeeded();
    await l.nth(1).click();
    await deplier(page);
    await expect(page.getByTestId('lecteur-barre')).toBeVisible({ timeout: 10_000 });
    await photo('01-lecon');
    // séance de Madjaliss
    await page.goto('/madjaliss/akhdari/1');
    const m = page.locator('[data-lecteur="m"][data-audio]:visible');
    await expect(m.first()).toBeVisible();
    await m.nth(1).scrollIntoViewIfNeeded();
    await m.nth(1).click();
    await deplier(page);
    await page.getByRole('button', { name: 'Lecture continue' }).click();
    await photo('02-madjaliss');
    // douas
    await page.goto('/vivre/douas?r=repas');
    const d = page.getByTestId('douas-ecouter');
    await expect(d.first()).toBeVisible();
    await d.first().click();
    await deplier(page);
    await page.getByRole('button', { name: 'Vitesse 0,75×' }).click();
    await page.getByRole('button', { name: 'Répéter la phrase en boucle' }).click();
    await photo('03-douas');
  }
});

test('captures du lecteur discret : exercice « écoute » et leçon, 390 et 1280 px, clair et sombre', async ({
  page,
}, info) => {
  const dir = process.env.LECTEUR_DISCRET_CAP;
  test.skip(
    !dir || mobile(info.project.name),
    'captures : LECTEUR_DISCRET_CAP (projet ordinateur)',
  );
  test.setTimeout(240_000);
  mkdirSync(dir!, { recursive: true });
  const duree = await sons(page);
  duree.sec = 25;
  for (const [w, h] of [
    [390, 844],
    [1280, 800],
  ] as const)
    for (const mode of ['clair', 'sombre'] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: mode === 'sombre' ? 'dark' : 'light' });
      await page.goto('/lecons/en1.l01');
      await page.evaluate((m) => {
        localStorage.setItem('awzid.mode', m);
        localStorage.removeItem('awzid.lecteur.deplie');
      }, mode);
      await page.reload();
      const photo = async (nom: string) => {
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(900);
        await page.screenshot({ path: join(dir!, `${w}-${mode}-${nom}.png`) });
      };
      // exercice « écoute » : la question 1 joue, les questions 2 et 3 doivent rester lisibles
      const q = page
        .locator('[data-type="ecoute"] li[data-item="0"]')
        .getByTestId('ecouter')
        .first();
      await q.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -80));
      await q.click();
      await expect(region(page)).toBeAttached();
      await photo('1-exercice');
      // phrase de la leçon (hors exercice) : lecteur réduit, puis déplié par « Régler »
      await page.goto('/lecons/en1.l01');
      const l = page.locator('[data-lecteur="l"][data-audio]:visible').nth(1);
      await l.scrollIntoViewIfNeeded();
      await l.click();
      await expect(region(page)).toBeVisible();
      await photo('2-lecon');
      const regler = page.getByTestId('lecteur-regler');
      if (await regler.count()) {
        await regler.click();
        await photo('3-lecon-regle');
      }
    }
});
