import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Mise à jour fiable (incident du 12/10/2026 : 23 onglets ouverts, le téléphone du client restait sur une ANCIENNE
 * version après un déploiement). Déploiement SIMULÉ : le fichier du service worker est servi avec une autre
 * version (même code, autre nom de version et donc autre cache), comme après une mise en production.
 * Vérifie : bandeau persistant, un toucher fait passer TOUS les onglets à la nouvelle version ; application
 * automatique au démarrage à froid, sur un écran neutre seulement (un onglet en pleine révision attend d'en sortir) ;
 * signets, réglages et données de l'appareil jamais perdus.
 */
test.describe.configure({ mode: 'serial' });

/**
 * Serveur intermédiaire propre au test (autre port, donc autre origine et autre service worker ; les cookies de
 * connexion, liés à l'hôte, restent valables) : tout est relayé tel quel vers l'application de test, sauf, une fois
 * « déployée », la nouvelle version du service worker. (Le routage de Playwright ne voit pas les vérifications de
 * mise à jour du worker : un vrai serveur est plus fidèle.)
 */
async function deploiementSimule(baseURL: string) {
  const cible = new URL(baseURL);
  const r = await fetch(new URL('/_app/version.json', cible));
  const ancienne = ((await r.json()) as { version: string }).version;
  const nouvelle = `${ancienne}-nouvelle`;
  let actif = false;
  const VERSIONNES = new Set(['/service-worker.js', '/_app/version.json']);
  const serveur = http.createServer((req, res) => {
    const chemin = new URL(req.url ?? '/', 'http://x').pathname;
    const modifie = actif && VERSIONNES.has(chemin);
    // catalogues versionnés (/i18n/<version>/…) : la « nouvelle » version est servie par les fichiers de l'ancienne
    const url = (req.url ?? '/').replace(`/i18n/${nouvelle}/`, `/i18n/${ancienne}/`);
    const headers = { ...req.headers, host: cible.host };
    if (modifie) delete headers['accept-encoding'];
    const amont = http.request(
      { host: cible.hostname, port: cible.port, path: url, method: req.method, headers },
      (rep) => {
        if (!modifie) {
          res.writeHead(rep.statusCode ?? 502, rep.headers);
          rep.pipe(res);
          return;
        }
        const morceaux: Buffer[] = [];
        rep.on('data', (c: Buffer) => morceaux.push(c));
        rep.on('end', () => {
          const corps = Buffer.from(
            Buffer.concat(morceaux).toString('utf8').replaceAll(ancienne, nouvelle),
          );
          const h = { ...rep.headers, 'content-length': String(corps.length) };
          delete h['etag'];
          delete h['last-modified'];
          res.writeHead(rep.statusCode ?? 200, h);
          res.end(corps);
        });
      },
    );
    amont.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(amont);
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = (serveur.address() as AddressInfo).port;
  return {
    ancienne,
    nouvelle,
    url: (p: string) => `http://127.0.0.1:${port}${p}`,
    deployer: () => (actif = true),
    fermer: () =>
      new Promise<void>((ok) => {
        serveur.closeAllConnections();
        serveur.close(() => ok());
      }),
  };
}

/** Attend que la page soit contrôlée par le service worker (première installation terminée). */
async function controlee(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) =>
        navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }),
      );
  });
}

/** Version du worker qui contrôle la page. */
const versionActive = (page: Page) =>
  page
    .evaluate(
      () =>
        new Promise<string | null>((resolve) => {
          const c = navigator.serviceWorker.controller;
          if (!c) return resolve(null);
          const canal = new MessageChannel();
          canal.port1.onmessage = (e) => resolve((e.data as { version?: string }).version ?? null);
          c.postMessage({ type: 'AWZID_VERSION' }, [canal.port2]);
          setTimeout(() => resolve(null), 3000);
        }),
    )
    // page en cours de rechargement : on réessaie
    .catch(() => null);

/** Marque l'onglet : la marque disparaît s'il est rechargé. */
const marquer = (page: Page) =>
  page.evaluate(() => ((window as unknown as { __ancien?: boolean }).__ancien = true));
const marque = (page: Page) =>
  page.evaluate(() => (window as unknown as { __ancien?: boolean }).__ancien === true);

/** Fait vérifier la présence d'une nouvelle version (comme au retour au premier plan). */
const verifierMaj = (page: Page) =>
  page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    await reg.update();
  });

test('deux onglets : un toucher sur « Mettre à jour » les fait passer tous deux à la nouvelle version, sans rien perdre', async ({
  page,
  context,
  baseURL,
}) => {
  const d = await deploiementSimule(baseURL!);
  await page.goto(d.url('/'));
  await controlee(page);
  const onglet2 = await context.newPage();
  await onglet2.goto(d.url('/plus'));
  await controlee(onglet2);
  expect(await versionActive(page)).toBe(d.ancienne);

  // données de l'appareil : signet du Coran, réglage d'affichage, donnée gardée dans IndexedDB
  const signets = JSON.stringify([{ s: 2, a: 255, p: 42, t: 1_760_000_000_000 }]);
  await page.evaluate(async (signets) => {
    localStorage.setItem('awzid.coran.signets.v1', signets);
    localStorage.setItem('awzid.mode', 'sombre');
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('awform');
      req.onsuccess = () => {
        const tx = req.result.transaction('kv', 'readwrite');
        tx.objectStore('kv').put({ lecons: ['en1.l01', 'en1.l02'] }, 'e2e-progression');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, signets);

  await marquer(page);
  await marquer(onglet2);
  d.deployer();
  await verifierMaj(page);

  // bandeau persistant dans les deux onglets (pas de « Plus tard »)
  for (const p of [page, onglet2]) {
    await expect(p.getByTestId('maj-bandeau')).toBeVisible({ timeout: 30_000 });
    await expect(p.getByTestId('maj-bandeau')).toContainText('Nouvelle version disponible');
    await expect(p.getByTestId('maj-plus-tard')).toHaveCount(0);
  }
  // pas d'application automatique avant le délai : les deux onglets n'ont pas bougé
  expect(await marque(page)).toBe(true);
  expect(await marque(onglet2)).toBe(true);

  await page.getByTestId('maj-appliquer').click();

  for (const p of [page, onglet2]) {
    await expect.poll(() => marque(p).catch(() => true), { timeout: 20_000 }).toBe(false);
    await p.waitForLoadState('load');
    await expect.poll(() => versionActive(p), { timeout: 10_000 }).toBe(d.nouvelle);
    // juste après la mise à jour : plus de bandeau
    await expect(p.getByTestId('maj-bandeau')).toHaveCount(0);
  }

  // rien n'est perdu
  const apres = await onglet2.evaluate(
    () =>
      new Promise<{ signets: string | null; mode: string | null; kv: unknown }>((resolve) => {
        const req = indexedDB.open('awform');
        req.onsuccess = () => {
          const g = req.result.transaction('kv').objectStore('kv').get('e2e-progression');
          g.onsuccess = () =>
            resolve({
              signets: localStorage.getItem('awzid.coran.signets.v1'),
              mode: localStorage.getItem('awzid.mode'),
              kv: g.result,
            });
        };
      }),
  );
  expect(apres).toEqual({
    signets,
    mode: 'sombre',
    kv: { lecons: ['en1.l01', 'en1.l02'] },
  });
  await onglet2.close();
  await d.fermer();
});

test('sans toucher : application automatique au démarrage à froid, sur un écran neutre ; un onglet en révision attend d’en sortir', async ({
  page,
  context,
  baseURL,
}) => {
  const d = await deploiementSimule(baseURL!);
  // onglet 1 : en pleine révision (activité en cours)
  await page.goto(d.url('/revisions'));
  await controlee(page);
  // onglet 2 : écran neutre
  const neutre = await context.newPage();
  await neutre.goto(d.url('/'));
  await controlee(neutre);
  await marquer(page);
  await marquer(neutre);

  d.deployer();
  await verifierMaj(neutre);
  await expect(neutre.getByTestId('maj-bandeau')).toBeVisible({ timeout: 30_000 });
  // en révision : ni bandeau ni rechargement
  await expect(page.getByTestId('maj-bandeau')).toHaveCount(0);

  // démarrage à froid d'un nouvel onglet (la version attend déjà) : appliquée seule, sans toucher le bandeau
  const froid = await context.newPage();
  await froid.goto(d.url('/'));
  // appliquée (heure notée par l'onglet), puis rechargée
  await expect
    .poll(() => froid.evaluate(() => sessionStorage.getItem('awzid-maj')).catch(() => null), {
      timeout: 30_000,
    })
    .not.toBeNull();
  await froid.waitForLoadState('load');
  await expect.poll(() => versionActive(froid), { timeout: 30_000 }).toBe(d.nouvelle);

  // l'onglet neutre suit tout seul
  await expect.poll(() => marque(neutre).catch(() => true), { timeout: 20_000 }).toBe(false);
  await neutre.waitForLoadState('load');
  await expect.poll(() => versionActive(neutre), { timeout: 10_000 }).toBe(d.nouvelle);

  // l'onglet en révision n'est JAMAIS rechargé pendant l'activité…
  await page.waitForTimeout(2000);
  expect(await marque(page)).toBe(true);
  await expect(page).toHaveURL(/\/revisions/);

  // … puis se met à jour dès le retour à un écran neutre (navigation dans l'application)
  await page.getByTestId('accueil').click();
  await expect.poll(() => marque(page).catch(() => true), { timeout: 20_000 }).toBe(false);
  await page.waitForLoadState('load');
  await expect.poll(() => versionActive(page), { timeout: 10_000 }).toBe(d.nouvelle);
  await neutre.close();
  await froid.close();
  await d.fermer();
});
