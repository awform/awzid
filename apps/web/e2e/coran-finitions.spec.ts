import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import {
  demoReciters,
  fileKey,
  installDemoReciters,
  removeDemoReciters,
  serveDemoAudio,
  tapVisible,
} from './audio-demo';
import { close, openDisplay, openSelector } from './coran';
import { expect, test } from './fixtures';

/**
 * Finitions du lecteur Coran (retours du client, 07/10/2026) :
 * 1. la basmala est LUE avant le verset 1 (sauf at-Tawba ; al-Fātiḥa en Ḥafṣ : c'est le verset 1), prise dans
 *    le fichier de la MÊME riwāya (verset 1 d'al-Fātiḥa du même récitateur), surlignée ; enchaînement d'une
 *    sourate à la suivante ; Qālūn : pas de fichier → rien lu, dit en petit ;
 * 2. la basmala se touche comme un verset (menu « Écouter ») : page exacte ou fluide, vue versets ;
 * 3-4. à chaque changement d'emplacement (flèche, glissement, recherche, « Aller à ») : 1er verset (ou basmala)
 *    sélectionné, proposition « Écouter ici » (disparaît seule) ; lecture en cours mise en pause (« Reprendre où
 *    j'étais ») ; réglage « continuer la lecture automatiquement » ;
 * 5. menu du verset : « Écouter d'ici » en premier ; appui long = lecture immédiate, sans menu ;
 * 6. traduction affichée au clic sur « Traduction » (non-régression), FR et EN, page exacte et fluide ; téléphone :
 *    Écouter, Traduction, Réglages = icône ET mot écrit, feuille de traduction au-dessus de tout ;
 * 8. après une recherche : « Écouter à partir d'ici » puis les autres actions du verset.
 * Captures : CF2_CAPTURES=<dossier>.
 */
const CAP = process.env.CF2_CAPTURES;
const mobile = (name: string) => name.startsWith('mobile');
async function shot(page: Page, name: string, project: string) {
  if (!CAP) return;
  mkdirSync(CAP, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: join(CAP, `${mobile(project) ? 'mobile' : 'bureau'}-${name}.png`),
  });
}
async function ready(page: Page) {
  await expect(page.getByTestId('barre-coran')).toBeVisible();
  await expect(page.locator('[data-testid="ouvrir-ecoute"]:disabled')).toHaveCount(0);
}
/** Relève la basmala et les versets surlignés pendant l'écoute (dans l'ordre). */
async function watchHeard(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __heard: string[] };
    w.__heard = [];
    new MutationObserver(() => {
      const b = document.querySelector('[data-bsm].on, [data-bsm].now');
      const v = document.querySelector('.aya.on, .aya.now, .g.on');
      const k = b ? `b${b.getAttribute('data-bsm')}` : v ? (v.getAttribute('data-aya') ?? '') : '';
      if (k && w.__heard.at(-1) !== k) w.__heard.push(k);
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
}
const heard = (page: Page) =>
  page.evaluate(() => (window as unknown as { __heard: string[] }).__heard);
async function tapListen(page: Page, target: Locator) {
  await tapVisible(page, target);
  const menu = page.getByTestId('menu-verset');
  await expect(menu).toBeVisible();
  // « Écouter d'ici » est la PREMIÈRE action du menu
  await expect(menu.locator('li').first().getByTestId('menu-ecouter')).toBeVisible();
  await menu.getByTestId('menu-ecouter').click();
}
async function stop(page: Page) {
  const b = page.getByTestId('arreter-audio');
  if (await b.isEnabled().catch(() => false)) await b.click();
}
const playingNow = (page: Page) =>
  expect(page.getByTestId('jouer')).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });

const DEMO = demoReciters();
const HAFS = DEMO?.find((r) => r.riwaya === 'hafs')?.id;
const QALUN = DEMO?.find((r) => r.riwaya === 'qalun')?.id;

test.describe('basmala, pages tournées, « Aller », appui long (vraies récitations de la démo)', () => {
  test.skip(!HAFS, 'démo absente (Docker, awform-db-1) : sauté');
  test.describe.configure({ timeout: 300_000 });
  const ids = (DEMO ?? []).filter((r) => r.id === HAFS || r.id === QALUN).map((r) => r.id);
  test.beforeAll(() => installDemoReciters(ids, [1, 2, 3, 9, 112, 113]));
  test.afterAll(() => removeDemoReciters(ids));

  test('1-2. basmala lue avant le verset 1 (fichier de la même riwāya), surlignée, touchable ; at-Tawba et al-Fātiḥa', async ({
    page,
  }, info) => {
    const asked = await serveDemoAudio(page);
    const id = HAFS!;
    // vue versets, verset 1 d'al-Ikhlāṣ : basmala (verset 1 d'al-Fātiḥa du MÊME récitateur), puis 112:1
    await page.goto(`/coran/lecteur?r=${id}&s=112&a=1&vue=versets`);
    await ready(page);
    await watchHeard(page);
    asked.length = 0;
    await tapListen(page, page.locator('[data-testid="texte-coran"] [data-aya="1"]'));
    await expect.poll(() => asked.length, { timeout: 30_000 }).toBeGreaterThan(1);
    expect(asked.slice(0, 2)).toEqual([fileKey(id, 1, 1), fileKey(id, 112, 1)]);
    await expect.poll(() => heard(page), { timeout: 20_000 }).toEqual(['b112', '1']);
    await shot(page, 'basmala-versets', info.project.name);
    await stop(page);
    // la basmala se touche : menu « Écouter » (titre « … basmala »), même lecture
    asked.length = 0;
    const b = page.locator('[data-testid="texte-coran"] [data-bsm="112"]');
    await b.click();
    await expect(page.getByTestId('menu-verset')).toContainText('basmala');
    await expect(page.getByTestId('menu-signet')).toHaveCount(0);
    await page.getByTestId('menu-ecouter').click();
    await expect.poll(() => asked[0], { timeout: 20_000 }).toBe(fileKey(id, 1, 1));
    await stop(page);
    // page (exacte ou fluide) : basmala touchable et surlignée
    await page.goto(`/coran/lecteur?r=${id}&page=604&vue=page`);
    await ready(page);
    await watchHeard(page);
    asked.length = 0;
    await tapListen(page, page.locator('[data-testid="mushaf-livre"] [data-bsm="113"]').first());
    await expect.poll(() => asked.length, { timeout: 30_000 }).toBeGreaterThan(1);
    expect(asked.slice(0, 2)).toEqual([fileKey(id, 1, 1), fileKey(id, 113, 1)]);
    await expect.poll(() => heard(page), { timeout: 20_000 }).toContain('b113');
    await shot(page, 'basmala-page', info.project.name);
    await stop(page);
    // at-Tawba : pas de basmala ; al-Fātiḥa (Ḥafṣ) : la basmala EST le verset 1, lue une seule fois
    for (const [s, first, second] of [
      [9, fileKey(id, 9, 1), fileKey(id, 9, 2)],
      [1, fileKey(id, 1, 1), fileKey(id, 1, 2)],
    ] as const) {
      await page.goto(`/coran/lecteur?r=${id}&s=${s}&a=1&vue=versets`);
      await ready(page);
      asked.length = 0;
      await tapListen(page, page.locator('[data-testid="texte-coran"] [data-aya="1"]'));
      await expect.poll(() => asked.length, { timeout: 60_000 }).toBeGreaterThan(1);
      expect(asked.slice(0, 2), `sourate ${s}`).toEqual([first, second]);
      await stop(page);
    }
  });

  test('1. enchaînement : fin d’al-Ikhlāṣ → basmala → al-Falaq 1', async ({ page }) => {
    const asked = await serveDemoAudio(page);
    const id = HAFS!;
    await page.goto(`/coran/lecteur?r=${id}&s=112&a=4&vue=versets`);
    await ready(page);
    asked.length = 0;
    await tapListen(page, page.locator('[data-testid="texte-coran"] [data-aya="4"]'));
    await expect.poll(() => asked.length, { timeout: 60_000 }).toBeGreaterThan(2);
    expect(asked.slice(0, 3)).toEqual([
      fileKey(id, 112, 4),
      fileKey(id, 1, 1),
      fileKey(id, 113, 1),
    ]);
    // la vue suit : al-Falaq affichée
    await expect(page.locator('[data-testid="texte-coran"] h2')).toContainText('الفلق');
    await stop(page);
  });

  test('1. Qālūn : pas de fichier de basmala dans sa riwāya → rien lu, dit en petit', async ({
    page,
  }) => {
    test.skip(!QALUN, 'pas de récitateur en Qālūn dans la démo');
    const asked = await serveDemoAudio(page);
    await page.goto(`/coran/lecteur?r=${QALUN}&s=112&a=1&vue=versets`);
    await ready(page);
    asked.length = 0;
    await tapListen(page, page.locator('[data-testid="texte-coran"] [data-aya="1"]'));
    await expect.poll(() => asked[0], { timeout: 20_000 }).toBe(fileKey(QALUN!, 112, 1));
    await expect(page.getByTestId('basmala-absente')).toBeVisible();
    // jamais l'audio d'une autre riwāya
    expect(asked.every((k) => k.startsWith(`${QALUN}/`))).toBe(true);
    await stop(page);
  });

  test('3-4. changement d’emplacement : 1er verset (ou basmala) sélectionné, proposition « Écouter ici » ; lecture en cours mise en pause (« Reprendre où j’étais ») ; réglage « continuer »', async ({
    page,
  }, info) => {
    test.setTimeout(400_000);
    const asked = await serveDemoAudio(page);
    const id = HAFS!;
    const prop = page.getByTestId('proposition');
    const pageNow = () => Number(new URL(page.url()).searchParams.get('page'));
    /** premier verset de la page affichée (s, a) */
    const firstOf = async (n: number) => {
      const k = (await page
        .locator(`[data-page="${n}"] [data-aya]`)
        .first()
        .getAttribute('data-aya'))!;
      return k.split(':').map(Number) as [number, number];
    };
    const selected = (s: number, a: number) =>
      a === 0
        ? page.locator(`[data-testid="mushaf-livre"] [data-bsm="${s}"].on`).first()
        : page.locator(`[data-testid="mushaf-livre"] [data-aya="${s}:${a}"].on`).first();

    // a) aucune lecture : la flèche sélectionne le 1er verset, propose « Écouter ici », ne lance rien
    await page.goto(`/coran/lecteur?r=${id}&page=2`);
    await ready(page);
    asked.length = 0;
    await page.getByTestId('mp-suiv').click();
    await expect.poll(pageNow).not.toBe(2);
    const n1 = pageNow();
    const [s1, a1] = await firstOf(n1);
    await expect(selected(s1, a1)).toBeVisible();
    await expect(prop).toBeVisible();
    await expect(page.getByTestId('reprendre-lecture')).toHaveCount(0);
    await page.waitForTimeout(1000);
    expect(asked).toEqual([]);
    await shot(page, 'proposition-sans-lecture', info.project.name);
    // feuilleter vite : une seule proposition, mise à jour
    await page.getByTestId('mp-suiv').click();
    await page.getByTestId('mp-suiv').click();
    await expect(prop).toHaveCount(1);
    // elle disparaît d'elle-même (≈ 6 s)
    await expect(prop).toHaveCount(0, { timeout: 9000 });
    expect(asked).toEqual([]);

    // b) lecture en cours : pause, « Écouter ici » et « Reprendre où j'étais » ; rien ne repart sans geste
    await page.goto(`/coran/lecteur?r=${id}&page=49`);
    await ready(page);
    await tapListen(page, page.locator('[data-testid="mushaf-livre"] [data-aya="2:283"]').first());
    await playingNow(page);
    await page.getByTestId('mp-suiv').click();
    await expect.poll(pageNow).not.toBe(49);
    await expect(page.getByTestId('jouer')).toHaveAttribute('aria-pressed', 'false');
    await expect(prop).toBeVisible();
    await expect(page.getByTestId('reprendre-lecture')).toBeVisible();
    // Āl ʿImrān commence la page : la BASMALA est sélectionnée
    const n2 = pageNow();
    const [s2, a2] = await firstOf(n2);
    if (a2 === 1) await expect(selected(s2, 0)).toBeVisible();
    asked.length = 0;
    await page.waitForTimeout(1000);
    expect(asked).toEqual([]);
    await shot(page, 'proposition-pause', info.project.name);
    // « Écouter ici » : basmala (si une sourate commence) puis le 1er verset de la page
    await page.getByTestId('ecouter-ici').click();
    const want = a2 === 1 ? [fileKey(id, 1, 1), fileKey(id, s2, 1)] : [fileKey(id, s2, a2)];
    await expect.poll(() => asked.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(want.length);
    expect(asked.slice(0, want.length)).toEqual(want);
    await playingNow(page);
    await expect(prop).toHaveCount(0);

    // c) « Reprendre où j'étais » : retour au verset écouté, la lecture reprend
    await page.getByTestId('mp-prec').click();
    await expect(page.getByTestId('reprendre-lecture')).toBeVisible();
    await page.getByTestId('reprendre-lecture').click();
    await playingNow(page);
    await expect.poll(pageNow).toBe(n2);
    await stop(page);

    // d) « Aller » à la page 50 pendant la lecture : même règle (pause + proposition), basmala sélectionnée
    await page.goto(`/coran/lecteur?r=${id}&page=2`);
    await ready(page);
    await tapListen(page, page.locator('[data-testid="mushaf-livre"] [data-aya="2:2"]').first());
    await playingNow(page);
    await openSelector(page, 'page');
    await page.getByTestId('sel-page').fill('50');
    await page.getByTestId('sel-page-aller').click();
    await expect(page.locator('[data-page="50"]')).toBeVisible();
    await expect(page.getByTestId('jouer')).toHaveAttribute('aria-pressed', 'false');
    await expect(selected(3, 0)).toBeVisible();
    asked.length = 0;
    await page.getByTestId('ecouter-ici').click();
    await expect.poll(() => asked.length, { timeout: 30_000 }).toBeGreaterThan(1);
    expect(asked.slice(0, 2)).toEqual([fileKey(id, 1, 1), fileKey(id, 3, 1)]);
    await stop(page);

    // e) réglage « Continuer la lecture automatiquement » : la flèche enchaîne sans demander
    await openDisplay(page);
    await page.getByTestId('nav-lecture').selectOption('auto');
    await close(page);
    await page.goto(`/coran/lecteur?r=${id}&page=2`);
    await ready(page);
    await tapListen(page, page.locator('[data-testid="mushaf-livre"] [data-aya="2:2"]').first());
    await playingNow(page);
    asked.length = 0;
    await page.getByTestId('mp-suiv').click();
    await expect.poll(pageNow).not.toBe(2);
    const [s3, a3] = await firstOf(pageNow());
    await expect.poll(() => asked[0], { timeout: 20_000 }).toBe(fileKey(id, s3, a3));
    await playingNow(page);
    await expect(prop).toHaveCount(0);
    await stop(page);
    await openDisplay(page);
    await page.getByTestId('nav-lecture').selectOption('demander');
    await close(page);

    // f) vue versets : sourate suivante → basmala sélectionnée, proposition, rien ne joue
    await page.goto(`/coran/lecteur?r=${id}&s=112&a=1&vue=versets`);
    await ready(page);
    asked.length = 0;
    await page.getByTestId('sourate-suivante').click();
    await expect(page.locator('[data-testid="texte-coran"] [data-bsm="113"].sel')).toBeVisible();
    await expect(prop).toBeVisible();
    await page.waitForTimeout(800);
    expect(asked).toEqual([]);
    await page.getByTestId('ecouter-ici').click();
    await expect.poll(() => asked.length, { timeout: 30_000 }).toBeGreaterThan(1);
    expect(asked.slice(0, 2)).toEqual([fileKey(id, 1, 1), fileKey(id, 113, 1)]);
    await stop(page);
  });

  test('5. appui long sur un verset : lecture immédiate depuis ce verset, sans menu', async ({
    page,
  }) => {
    const asked = await serveDemoAudio(page);
    const id = HAFS!;
    await page.goto(`/coran/lecteur?r=${id}&s=112&a=1&vue=versets`);
    await ready(page);
    const v = page.locator('[data-testid="texte-coran"] [data-aya="2"]');
    await v.scrollIntoViewIfNeeded();
    const box = (await v.boundingBox())!;
    asked.length = 0;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    await expect.poll(() => asked[0], { timeout: 20_000 }).toBe(fileKey(id, 112, 2));
    await expect(page.getByTestId('menu-verset')).toBeHidden();
    await stop(page);
    // un toucher bref ouvre toujours le menu
    await v.click();
    await expect(page.getByTestId('menu-verset')).toBeVisible();
    await expect(page.getByTestId('menu-astuce')).toBeVisible();
    await close(page);
  });
});

test('6. traduction après le clic sur « Traduction » (FR et EN, page exacte et fluide) ; téléphone : mot « Traduction » écrit, feuille au-dessus de tout', async ({
  page,
}, info) => {
  test.setTimeout(400_000);
  const tel = mobile(info.project.name);
  const widths = tel ? [320, 375, 390, 412] : [0];
  for (const lang of ['french_rashid', 'english_rwwad'] as const) {
    for (const style of ['exact', 'fluide'] as const) {
      for (const w of widths) {
        if (w) await page.setViewportSize({ width: w, height: 860 });
        await page.goto('/coran/lecteur?page=3&vue=page');
        await ready(page);
        // langue choisie, traduction cachée : elle doit s'afficher au clic sur « Traduction »
        await openDisplay(page);
        await page.locator(`[data-style="${style}"]`).check({ force: true });
        await page.getByTestId('mp-traduction').selectOption(lang);
        await page.getByTestId('mp-traduction').selectOption('');
        await close(page);
        const tag = `${lang === 'english_rwwad' ? 'en' : 'fr'}-${style}${w ? `-${w}` : ''}`;
        const b = page.getByTestId('mp-trad');
        await expect(b).toBeInViewport();
        if (tel) {
          // icône ET mot écrit, visibles sans défiler : Écouter, Traduction, Réglages
          for (const [tid, word] of [
            ['ouvrir-ecoute', 'Écouter'],
            ['mp-trad', 'Traduction'],
            ['ouvrir-reglages-lecteur', 'Réglages'],
          ] as const) {
            const lbl = page.getByTestId(tid).locator('span', { hasText: word });
            await expect(lbl, `${tag} ${tid}`).toBeVisible();
            await expect(lbl, `${tag} ${tid}`).toBeInViewport();
          }
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await shot(page, `trad-bouton-${tag}`, info.project.name);
        }
        await b.click();
        const scope = tel
          ? page.getByTestId('feuille-traduction')
          : page.locator('aside[data-testid="mp-panneau-traduction"]');
        await expect(scope).toBeVisible();
        const v = scope.locator('[data-trad="2:6"] .ttext');
        await expect(v).toBeVisible();
        await expect(v).not.toBeEmpty();
        const panel = tel ? scope.locator('[data-testid="mp-panneau-traduction"]') : scope;
        await expect(panel).toHaveAttribute('lang', lang === 'english_rwwad' ? 'en' : 'fr');
        if (tel) {
          // la feuille est au-dessus de tout (ni barre du bas ni mini-barre)
          const top = await v.evaluate((el) => {
            const r = el.getClientRects()[0]!;
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return !!hit && el.contains(hit);
          });
          expect(top, tag).toBe(true);
          await shot(page, `trad-feuille-${tag}`, info.project.name);
          await close(page);
        } else {
          // grand écran : traduction à gauche, la page à droite
          const [tp, pg] = await Promise.all([
            panel.boundingBox(),
            page.getByTestId('mushaf-page').boundingBox(),
          ]);
          expect(tp!.x).toBeLessThan(pg!.x);
          await shot(page, `trad-gauche-${tag}`, info.project.name);
          await b.click();
          await expect(scope).toHaveCount(0);
        }
      }
    }
  }
  // vue versets : la traduction sous chaque verset, au clic
  await page.goto('/coran/lecteur?s=2&a=6&vue=versets');
  await ready(page);
  await page.getByTestId('mp-trad').click();
  await expect(page.locator('[data-testid="texte-coran"] [data-trad="2:6"]')).toBeVisible();
  await shot(page, 'trad-versets', info.project.name);
  // réglages de l'appareil remis comme au départ (français, traduction cachée, page exacte)
  await openDisplay(page);
  await page.getByTestId('mp-traduction').selectOption('french_rashid');
  await page.getByTestId('mp-traduction').selectOption('');
  await page.locator('[data-style="exact"]').check({ force: true });
  await page.getByTestId('vue-page').check({ force: true });
  await close(page);
});

test('8. après une recherche : « Écouter à partir d’ici » puis les autres actions du verset', async ({
  page,
}, info) => {
  await page.goto('/coran/lecteur?page=1');
  await ready(page);
  await openSelector(page);
  await page.getByTestId('sel-recherche').fill('2:255');
  await page.getByTestId('sel-recherche').press('Enter');
  await expect(page.getByTestId('ecouter-ici')).toBeVisible();
  await shot(page, 'apres-recherche', info.project.name);
  await page.getByTestId('ici-actions').click();
  const menu = page.getByTestId('menu-verset');
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('255');
  await expect(menu.locator('li').first().getByTestId('menu-ecouter')).toBeVisible();
  for (const id of ['menu-repeter', 'menu-traduction', 'menu-signet', 'menu-partager'])
    await expect(menu.getByTestId(id), id).toBeVisible();
  await menu.getByTestId('menu-traduction').click();
  await expect(menu.getByTestId('menu-traduction-texte')).toBeVisible();
  await shot(page, 'menu-verset', info.project.name);
  await close(page);
});
