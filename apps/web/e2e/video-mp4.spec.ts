import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Vidéos vivantes → MP4 d'ESSAI (20/10/2026, prototype de la chaîne « MP4 = film de l'écran d'une vidéo vivante »).
 * Seulement avec `VIDEO_MP4=<dossier>` (et l'audio des leçons du niveau importé : `E2E_LECONS_NIVEAUX=en1,ad1`) :
 *  - téléphone vertical 432 × 768 px CSS, densité 2,5 (1080 × 1920 pixels), thème clair ;
 *  - Playwright filme l'écran : `recordVideo` ne garde que les pixels CSS (432 × 768, essai du 20/10 : texte flou une
 *    fois agrandi) ; il reste comme film témoin, et le MP4 est fait des images de la même capture du navigateur
 *    (`Page.startScreencast` par la session CDP de Playwright) en pixels de l'appareil, horodatées par le navigateur ;
 *  - le lecteur tient un journal des sons joués (`window.__vv`, créé par le test seulement : fichier, instant), sur la
 *    même horloge que les images : ffmpeg remet chaque son à son instant (adelay, amix), H.264 + AAC, 30 images/s.
 * Les sons absents de la source sont signalés dans le journal JSON (vidéo muette à ces endroits).
 */
const H = { 'x-awform': '1' };
const PAYS = 'LU';
const DIR = process.env.VIDEO_MP4;
const SRC = process.env.AWFORM_LECONS_AUDIO_SOURCE ?? join(homedir(), 'lecons-audio');

type Essai = { nom: string; unite: string; mode: 'courte' | 'lettre' | 'quiz' };
const ESSAIS: Essai[] = (
  [
    { nom: 'ad1-l07_lecon-6_courte', unite: 'ad1.l07', mode: 'courte' },
    { nom: 'ad1-l03_lecon-3_par-lettre-1', unite: 'ad1.l03', mode: 'lettre' },
    { nom: 'ad1-l13_lecon-11_quiz', unite: 'ad1.l13', mode: 'quiz' },
  ] as Essai[]
).filter((e) => !process.env.VIDEO_MP4_SEUL || e.nom.includes(process.env.VIDEO_MP4_SEUL));

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-mp4-${Date.now()}@e2e.test`;
  execFileSync(
    process.execPath,
    ['../api/dist/cli/staff.js', '--kind', 'admin', '--email', email, '--test'],
    { env: { ...process.env, AWFORM_STAFF_PASSWORD: password() }, stdio: 'ignore' },
  );
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const adm = await ctx.newPage();
  expect(
    (
      await adm.request.post('/api/v1/auth/login', {
        headers: H,
        data: { email, password: password() },
      })
    ).status(),
  ).toBe(200);
  const { secret } = (await (
    await adm.request.post('/api/v1/auth/totp/setup', { headers: H, data: {} })
  ).json()) as { secret: string };
  const ok = await adm.request.post('/api/v1/auth/totp/confirm', {
    headers: H,
    data: { code: totp(secret, Math.floor(Date.now() / 30_000)) },
  });
  expect(ok.status(), await ok.text()).toBe(200);
  return adm;
}
async function remettre(adm: Page) {
  const d = (await (await adm.request.get('/api/v1/admin/fonctions')).json()) as {
    fonctions: Array<{ cle: string; regles: Array<{ id: string }> }>;
  };
  for (const r of d.fonctions.find((f) => f.cle === 'video_vivante')?.regles ?? [])
    await adm.request.delete(`/api/v1/admin/fonctions/regles/${r.id}`, { headers: H });
}

type Q = {
  k: string;
  options?: string[];
  dit?: { ar: string };
  reponse?: string;
  vrai?: boolean;
  mots?: Array<{ oui?: boolean }> | string[];
  ordre?: number[];
  items?: unknown[];
  grille?: string[];
  cible?: string;
};

/** Quiz joué automatiquement : chaque question reçoit la bonne réponse après un temps de réflexion. */
async function repondre(page: Page) {
  let vu = '';
  const opt = (i: number) => page.locator(`.vv .opt[data-o="${i}"]`).click();
  for (;;) {
    if (await page.getByTestId('vv-fin').isVisible()) return;
    const e = await page.evaluate(() => ({
      q: (window as unknown as { __vv: { q?: unknown } }).__vv.q,
      k: document.querySelector('.vv .vv-c .k')?.textContent ?? '',
      s: document.querySelector('.vv-sc')?.getAttribute('data-scene') ?? '',
      libre: !!document.querySelector('.vv .opt:not([disabled])'),
    }));
    const cle = `${e.s} ${e.k}`;
    if (!e.q || !e.libre || cle === vu) {
      await page.waitForTimeout(150);
      continue;
    }
    vu = cle;
    const q = e.q as Q;
    // temps de réflexion (après la voix de la question)
    await page.waitForTimeout(3000);
    switch (q.k) {
      case 'ecoute':
        await opt(q.options!.indexOf(q.dit!.ar));
        break;
      case 'premiere':
      case 'complete':
        await opt(q.options!.indexOf(q.reponse!));
        break;
      case 'vf':
        await opt(q.vrai ? 0 : 1);
        break;
      case 'contient':
        for (const [i, m] of (q.mots as Array<{ oui?: boolean }>).entries())
          if (m.oui) {
            await opt(i);
            await page.waitForTimeout(500);
          }
        await page.waitForTimeout(600);
        await page.locator('.vv [data-v]').click();
        break;
      case 'ordre':
        for (const i of q.ordre!) {
          await opt(i);
          await page.waitForTimeout(700);
        }
        break;
      case 'chasse':
        for (const [i, l] of q.grille!.entries())
          if (l === q.cible) {
            await opt(i);
            await page.waitForTimeout(400);
          }
        break;
      case 'relier': {
        const n = q.items!.length;
        const dec = Math.max(1, Math.floor(n / 2)) % Math.max(1, n);
        for (let k = 0; k < n; k++) {
          await page.locator(`.vv [data-g="${k}"]`).click();
          await page.waitForTimeout(900);
          for (let j = 0; j < n; j++)
            if ((j + dec) % n === k) await page.locator(`.vv [data-d="${j}"]`).click();
          await page.waitForTimeout(500);
        }
        break;
      }
    }
  }
}

test.describe('vidéos vivantes : MP4 d’essai', () => {
  test.skip(!DIR, 'VIDEO_MP4 non défini');
  test.use({ compte: null });
  let adm: Page;
  test.beforeAll(async ({ browser }) => {
    adm = await admin(browser);
    await remettre(adm);
    const r = await adm.request.post('/api/v1/admin/fonctions/video_vivante/regles', {
      headers: H,
      data: { effet: 'on', pays: PAYS },
    });
    expect(r.status(), await r.text()).toBe(201);
  });
  test.afterAll(async () => {
    if (adm) await remettre(adm);
  });

  for (const e of ESSAIS)
    test(e.nom, async ({ browser }) => {
      test.skip(test.info().project.name !== 'mobile-chromium', 'un seul film par essai');
      test.setTimeout(1_800_000);
      const dir = DIR!;
      const brut = join(dir, '_brut', e.nom);
      rmSync(brut, { recursive: true, force: true });
      mkdirSync(brut, { recursive: true });
      const ctx = await browser.newContext({
        baseURL: test.info().project.use.baseURL,
        viewport: { width: 432, height: 768 },
        deviceScaleFactor: 2.5,
        isMobile: true,
        hasTouch: true,
        colorScheme: 'light',
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        // témoin : le film de `recordVideo` (432 × 768 px CSS, posés dans un cadre 1080 × 1920)
        recordVideo: { dir: brut, size: { width: 432, height: 768 } },
      });
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        (window as unknown as { __vv: unknown }).__vv = { sons: [] };
        try {
          localStorage.setItem('awzid.lecon.tout', '1');
        } catch {
          /* stockage indisponible */
        }
      });
      await newAdult(page, 'mp4', PAYS);
      await page.goto(`/lecons/${e.unite}`);
      await page.getByTestId('voir-video').click();
      await expect(page.locator('.vv .mode').first()).toBeVisible();
      // par lettre : la première lettre de la leçon (écran du choix de la lettre)
      let depart = page.locator(`.vv .mode[data-mode="${e.mode}"]`);
      if (e.mode === 'lettre') {
        await depart.click();
        if (await page.locator('.vv .vv-dep .tuile').count())
          depart = page.locator('.vv .vv-dep .tuile').first();
      }
      // images de l'écran en pixels de l'appareil (1080 × 1920), horodatées par le navigateur (même horloge que le
      // journal des sons) : la même capture que `recordVideo`, sans la réduction aux pixels CSS
      const cdp = await ctx.newCDPSession(page);
      const images: Array<{ f: string; t: number }> = [];
      cdp.on('Page.screencastFrame', (ev) => {
        const f = join(brut, `${String(images.length).padStart(6, '0')}.jpg`);
        writeFileSync(f, Buffer.from(ev.data, 'base64'));
        images.push({ f, t: (ev.metadata.timestamp ?? Date.now() / 1000) * 1000 });
        void cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
      });
      await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 90,
        maxWidth: 1080,
        maxHeight: 1920,
      });
      await page.waitForTimeout(1200);
      const td = await page.evaluate(() => Date.now());
      await depart.click();
      if (e.mode === 'quiz') await repondre(page);
      await expect(page.getByTestId('vv-fin')).toBeVisible({ timeout: 1_500_000 });
      await page.waitForTimeout(2500);
      const t1 = await page.evaluate(() => Date.now());
      await cdp.send('Page.stopScreencast');
      const sons = await page.evaluate(
        () => (window as unknown as { __vv: { sons: Array<[string, number]> } }).__vv.sons,
      );
      await ctx.close();

      // —— images : du départ à la fin (chaque image dure jusqu'à la suivante), 30 images/s
      const avant = images.filter((x) => x.t <= td).at(-1);
      const film = [
        ...(avant ? [{ ...avant, t: td }] : []),
        ...images.filter((x) => x.t > td && x.t < t1),
      ];
      expect(film.length, 'aucune image').toBeGreaterThan(10);
      const liste = film
        .map(
          (x, i) => `file '${x.f}'\nduration ${(((film[i + 1]?.t ?? t1) - x.t) / 1000).toFixed(4)}`,
        )
        .join('\n');
      writeFileSync(join(brut, 'images.txt'), `${liste}\nfile '${film.at(-1)!.f}'\n`);
      const duree = (t1 - td) / 1000;
      // —— sons : chaque fichier joué à son instant (journal du lecteur), H.264 + AAC
      const presents = sons.filter(([id]) => existsSync(join(SRC, `${id}.mp3`)));
      const absents = sons.filter(([id]) => !existsSync(join(SRC, `${id}.mp3`)));
      const args = ['-y', '-hide_banner', '-loglevel', 'error'];
      args.push('-f', 'concat', '-safe', '0', '-i', join(brut, 'images.txt'));
      for (const [id] of presents) args.push('-i', join(SRC, `${id}.mp3`));
      const f: string[] = [
        '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=white,fps=30,format=yuv420p[v]',
      ];
      presents.forEach(([, t], i) => {
        const ms = Math.max(0, Math.round(t - td));
        f.push(
          `[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${ms}:all=1[a${i}]`,
        );
      });
      f.push(
        presents.length
          ? `${presents.map((_, i) => `[a${i}]`).join('')}amix=inputs=${presents.length}:normalize=0:dropout_transition=0,apad[a]`
          : 'anullsrc=r=48000:cl=stereo[a]',
      );
      const mp4 = join(dir, `${e.nom}.mp4`);
      args.push(
        '-filter_complex',
        f.join(';'),
        '-map',
        '[v]',
        '-map',
        '[a]',
        '-t',
        duree.toFixed(2),
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '18',
        '-profile:v',
        'high',
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        '-ar',
        '48000',
        '-movflags',
        '+faststart',
        mp4,
      );
      execFileSync('ffmpeg', args, { stdio: 'inherit' });
      writeFileSync(
        join(dir, `${e.nom}.json`),
        JSON.stringify(
          {
            unite: e.unite,
            mode: e.mode,
            duree_s: Math.round(duree * 10) / 10,
            images: film.length,
            sons: sons.map(([id, t]) => ({
              fichier: `${id}.mp3`,
              a_s: Math.round(t - td) / 1000,
              present: existsSync(join(SRC, `${id}.mp3`)),
            })),
            absents: absents.length,
          },
          null,
          1,
        ),
      );
      // images effacées (le film témoin de recordVideo reste dans _brut)
      for (const x of images) rmSync(x.f, { force: true });
    });
});
