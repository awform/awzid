import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { expect, newAdult, password, test } from './fixtures';
import { totp } from './totp';

/**
 * Vidéos vivantes v2 → MP4 pour les réseaux (20/10/2026 ; chaîne « MP4 = film de l'écran d'une vidéo vivante »).
 * Seulement avec `VIDEO_MP4=<dossier>` (et l'audio des leçons du niveau importé : `E2E_LECONS_NIVEAUX=ad1`).
 * Fabrication en lot : `scripts/video-mp4-lot.sh <niveau> [modes] [formats]` (VIDEO_MP4_NIVEAU, VIDEO_MP4_MODES,
 * VIDEO_MP4_FORMATS, VIDEO_MP4_UNITES) ; sans niveau, les trois essais historiques (ad1 l07 courte, l03 par lettre,
 * l13 quiz) au format vertical.
 *  - lecteur v2 (interrupteurs `video_vivante` et `video_v2` ouverts pour le pays du compte de test) en mode
 *    ENREGISTREMENT (`window.__vvRec`, créé par ce test seulement) : sans commandes, lancé dans le mode voulu ;
 *  - trois formats tirés de la même scène, sans montage : vertical 9:16 (432 × 768 px CSS × 2,5 = 1080 × 1920),
 *    horizontal 16:9 (960 × 540 × 2 = 1920 × 1080, textes plus grands), carré 1:1 (540 × 540 × 2 = 1080 × 1080) ;
 *    zones de sécurité du 9:16 (règle commune TikTok, Reels, Shorts : haut 12 %, bas 25 %, droite 13 %, gauche 6 %) ;
 *    feuille `video-mp4.css`, hors de l'application ;
 *  - cartons d'ouverture (1,8 s : logo, niveau, leçon, titre du livre) et de fin (2,7 s : « Continuez dans l'appli
 *    Awzid », awzid.com) ; les MP4 des réseaux VOUVOIENT (comme la série publiée), l'application tutoie ;
 *  - images : capture de l'écran par le navigateur (`Page.startScreencast`) en pixels de l'appareil, horodatées ;
 *    sons : journal du lecteur (`window.__vv`, même horloge), fondu de 50 ms au début et à la fin de chaque fichier,
 *    posés à leur instant, mélange normalisé à -16 LUFS (loudnorm en deux passes, crête -1,5 dBTP) ;
 *  - sous-titres incrustés (bandeau du lecteur : traduction du livre de ce qui est dit) et fichier `.fr.srt` tiré du
 *    même journal ; chapitres YouTube (intertitres du lecteur) dans le JSON, avec la mesure du son.
 * Pas de musique, aucun visage. Les sons absents de la source sont signalés dans le JSON (film muet à ces endroits).
 */
const H = { 'x-awform': '1' };
const PAYS = 'LU';
const DIR = process.env.VIDEO_MP4;
const SRC = process.env.AWFORM_LECONS_AUDIO_SOURCE ?? join(homedir(), 'lecons-audio');
const NIVEAU = process.env.VIDEO_MP4_NIVEAU;
const liste = (v: string | undefined, d: string) =>
  (v || d)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

type Format = '9x16' | '16x9' | '1x1';
const FORMATS: Record<Format, { vp: [number, number]; dpr: number; nom: string }> = {
  '9x16': { vp: [432, 768], dpr: 2.5, nom: 'vertical-9x16' },
  '16x9': { vp: [960, 540], dpr: 2, nom: 'horizontal-16x9' },
  '1x1': { vp: [540, 540], dpr: 2, nom: 'carre-1x1' },
};
type Mode = 'courte' | 'lettre' | 'quiz' | 'longue' | 'revision';
type Essai = { unite: string; mode: Mode; format: Format };
/** unités du lot (VIDEO_MP4_UNITES=l07,l08… : seulement celles-ci) */
const UNITES = liste(process.env.VIDEO_MP4_UNITES, '');
const ESSAIS: Essai[] = (
  NIVEAU
    ? Array.from({ length: 25 }, (_, i) => `${NIVEAU}.l${String(i + 1).padStart(2, '0')}`)
        .filter((u) => !UNITES.length || UNITES.some((x) => u === x || u.endsWith(`.${x}`)))
        .flatMap((unite) =>
          liste(process.env.VIDEO_MP4_MODES, 'courte').flatMap((mode) =>
            liste(process.env.VIDEO_MP4_FORMATS, '9x16,16x9,1x1').map((format) => ({
              unite,
              mode: mode as Mode,
              format: format as Format,
            })),
          ),
        )
    : ([
        { unite: 'ad1.l07', mode: 'courte', format: '9x16' },
        { unite: 'ad1.l03', mode: 'lettre', format: '9x16' },
        { unite: 'ad1.l13', mode: 'quiz', format: '9x16' },
      ] as Essai[])
).filter(
  (e) =>
    !process.env.VIDEO_MP4_SEUL ||
    `${e.unite} ${e.mode} ${e.format}`.includes(process.env.VIDEO_MP4_SEUL),
);

/** textes des cartons (MP4 des réseaux : vouvoiement, comme la série publiée), hors des catalogues de l'appli */
const CARTON = {
  niveau: (code: string) =>
    /^ad(\d+)$/.test(code) ? `Adultes · niveau ${/^ad(\d+)$/.exec(code)![1]}` : code,
  continuez: "Continuez dans l'appli Awzid",
  site: 'awzid.com',
};
const LOGO = [
  process.env.AWZID_LOGO,
  join(homedir(), 'da-reseaux', 'assets', 'logo', 'awzid-logo-clair.svg'),
  join(import.meta.dirname, '..', 'static', 'awzid-icone.svg'),
].find((f) => f && existsSync(f))!;
const FEUILLE = readFileSync(join(import.meta.dirname, 'video-mp4.css'), 'utf8');

async function admin(browser: Browser): Promise<Page> {
  const email = `admin-mp4-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
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
/**
 * interrupteurs ouverts pour le pays du compte de test (une fois, quel que soit le nombre de navigateurs) ; jamais
 * retirés ici : plusieurs navigateurs filment en même temps, et la base de test est remise à zéro à chaque lancement
 */
async function ouvrirInterrupteurs(adm: Page) {
  const d = (await (await adm.request.get('/api/v1/admin/fonctions')).json()) as {
    fonctions: Array<{ cle: string; regles: Array<{ pays?: string | null; effet?: string }> }>;
  };
  for (const cle of ['video_vivante', 'video_v2'])
    if (!d.fonctions.find((f) => f.cle === cle)?.regles.some((r) => r.pays === PAYS)) {
      const r = await adm.request.post(`/api/v1/admin/fonctions/${cle}/regles`, {
        headers: H,
        data: { effet: 'on', pays: PAYS },
      });
      expect(r.status(), await r.text()).toBe(201);
    }
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
type Journal = {
  sons: Array<[string, number]>;
  scenes: Array<[string, number]>;
  st: Array<[string, number]>;
  ch: Array<[string, number]>;
  zoom: string[];
  q?: Q;
};

/**
 * Joue la vidéo jusqu'au bout : un quiz reçoit la bonne réponse après un temps de réflexion ; « À toi de jouer la
 * scène ! » : le premier rôle, une fois, puis la scène suivante.
 */
async function jouerJusquauBout(page: Page) {
  let vu = '';
  let joue = false;
  const opt = (i: number) => page.locator(`.vv .opt[data-o="${i}"]`).click();
  for (let t = 0; t < 20_000; t++) {
    if (await page.evaluate(() => !!(window as unknown as { __fin?: number }).__fin)) return;
    if (await page.locator('.vv .roles button').first().isVisible()) {
      if (joue) {
        await page.evaluate(() =>
          document
            .querySelector('.vv')
            ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
        );
      } else {
        joue = true;
        await page.locator('.vv .roles button').first().click();
      }
      await page.waitForTimeout(300);
      continue;
    }
    const e = await page.evaluate(() => ({
      q: (window as unknown as { __vv: Journal }).__vv.q,
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
    const q = e.q;
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

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[x]!);
/** nom de fichier : lettres latines sans accents (« Leçon 6 » → lecon-6) */
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[àâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o')
    .replace(/[ùûü]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
/** horodatage d'un sous-titre (.srt) */
const ts = (s: number) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const dureeSon = (f: string) =>
  Number(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      f,
    ])
      .toString()
      .trim(),
  );
/** sortie d'erreur de ffmpeg (mesures loudnorm et ebur128) */
const stderrDe = (args: string[]) =>
  spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stderr ?? '';

test.describe('vidéos vivantes v2 : MP4 pour les réseaux', () => {
  test.skip(!DIR, 'VIDEO_MP4 non défini');
  test.describe.configure({ mode: 'parallel' });
  test.use({ compte: null });
  test.beforeAll(async ({ browser }) => {
    await ouvrirInterrupteurs(await admin(browser));
  });

  for (const e of ESSAIS)
    test(`${e.unite} ${e.mode} ${e.format}`, async ({ browser }) => {
      test.skip(test.info().project.name !== 'mobile-chromium', 'un seul film par essai');
      test.setTimeout(1_800_000);
      const F = FORMATS[e.format];
      const dir = DIR!;
      const brut = join(dir, '_brut', `${e.unite}_${e.mode}_${e.format}`);
      rmSync(brut, { recursive: true, force: true });
      mkdirSync(brut, { recursive: true });
      const ctx = await browser.newContext({
        baseURL: test.info().project.use.baseURL,
        viewport: { width: F.vp[0], height: F.vp[1] },
        deviceScaleFactor: F.dpr,
        colorScheme: 'light',
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        // feuille des MP4 (cartons, formats, zones) posée dans la page : hors de l'application
        bypassCSP: true,
      });
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        (window as unknown as { __vv: unknown }).__vv = {
          sons: [],
          scenes: [],
          st: [],
          ch: [],
          zoom: [],
        };
        try {
          localStorage.setItem('awzid.lecon.tout', '1');
        } catch {
          /* stockage indisponible */
        }
      });
      await newAdult(page, 'mp4', PAYS);
      await page.goto(`/lecons/${e.unite}`);
      // repérage : modes, titre du livre (mis en forme par le lecteur : arabe sur sa ligne) et nom de l'unité
      await page.getByTestId('voir-video').click();
      await expect(page.locator('.vv .mode').first()).toBeVisible();
      const modes = await page
        .locator('.vv .mode')
        .evaluateAll((els) => els.map((x) => (x as HTMLElement).dataset.mode));
      if (!modes.includes(e.mode)) {
        await ctx.close();
        test.skip(true, `${e.unite} : pas de mode ${e.mode}`);
        return;
      }
      const titre = await page
        .locator('.vv .vv-dep > .frh')
        .first()
        .evaluate((x) => x.outerHTML)
        .catch(() => '');
      await page.locator(`.vv .mode[data-mode="${e.mode}"]`).click();
      if (e.mode === 'lettre' && (await page.locator('.vv .vv-dep .tuile').count()))
        await page.locator('.vv .vv-dep .tuile').first().click();
      await expect(page.locator('.vv-t .k')).toContainText('·', { timeout: 15_000 });
      const nomUnite = ((await page.locator('.vv-t .k').textContent()) ?? '').split(' · ')[1] ?? '';
      await page.locator('.vv [data-k="fermer"]').click();
      const nom = `${e.unite.replace('.', '-')}_${slug(nomUnite) || 'unite'}_${e.mode}_v2_${F.nom}`;

      // feuille des MP4, format, carton d'ouverture
      await page.addStyleTag({ content: FEUILLE });
      const logo = readFileSync(LOGO, 'utf8').replace(/<\?xml[^>]*>/, '');
      await page.evaluate(
        ({ format, html }) => {
          document.documentElement.dataset.format = format;
          document.body.style.overflow = 'hidden';
          const c = document.createElement('div');
          c.className = 'carton debut';
          c.innerHTML = html;
          document.body.append(c);
        },
        {
          format: e.format,
          html: `<div class="cb"><div class="logo">${logo}</div><p class="kk">${esc(CARTON.niveau(e.unite.split('.')[0]!))}</p><p class="lec">${esc(nomUnite)}</p><div class="filet"><i></i></div>${titre.replace('class="frh"', 'class="frh ti"')}</div>`,
        },
      );
      await page.evaluate(() => document.fonts.ready);
      // images de l'écran en pixels de l'appareil, horodatées par le navigateur (même horloge que le journal)
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
        quality: 92,
        maxWidth: F.vp[0] * F.dpr,
        maxHeight: F.vp[1] * F.dpr,
      });
      await page.waitForTimeout(1200);
      // départ : le carton d'ouverture dure 1,8 s ; le lecteur prépare la vidéo dessous et attend sa fin
      const td = await page.evaluate(
        ({ mode }) => {
          const W = window as unknown as {
            __vvRec: unknown;
            __fin?: number;
          };
          const carton = document.querySelector<HTMLElement>('.carton.debut')!;
          // journal neuf : rien du repérage (sommaire, sons) ne passe dans le film
          (W as unknown as { __vv: unknown }).__vv = {
            sons: [],
            scenes: [],
            st: [],
            ch: [],
            zoom: [],
          };
          W.__vvRec = {
            mode,
            attente: new Promise<void>((ok) =>
              setTimeout(() => {
                carton.classList.add('sort');
                setTimeout(() => carton.remove(), 400);
                ok();
              }, 1800),
            ),
            onFin: () => (W.__fin = Date.now()),
          };
          document.querySelector<HTMLElement>('[data-testid="voir-video"]')!.click();
          return Date.now();
        },
        { mode: e.mode },
      );
      await expect(page.getByTestId('vv')).toBeVisible();
      await jouerJusquauBout(page);
      // carton de fin (2,7 s)
      await page.evaluate(
        ({ html }) => {
          const c = document.createElement('div');
          c.className = 'carton fin';
          c.innerHTML = html;
          document.body.append(c);
        },
        {
          html: `<div class="cb"><div class="logo">${logo}</div><div class="filet"><i></i></div><p class="lec">${esc(CARTON.continuez)}</p><p class="url">${esc(CARTON.site)}</p></div>`,
        },
      );
      await page.waitForTimeout(2700);
      const t1 = await page.evaluate(() => Date.now());
      await page.waitForTimeout(300);
      await cdp.send('Page.stopScreencast');
      const J = await page.evaluate(() => (window as unknown as { __vv: Journal }).__vv);
      await ctx.close();

      // —— images : du départ à la fin (chaque image dure jusqu'à la suivante), 30 images/s
      const avant = images.filter((x) => x.t <= td).at(-1);
      const film = [
        ...(avant ? [{ ...avant, t: td }] : []),
        ...images.filter((x) => x.t > td && x.t < t1),
      ];
      expect(film.length, 'aucune image').toBeGreaterThan(10);
      writeFileSync(
        join(brut, 'images.txt'),
        `${film.map((x, i) => `file '${x.f}'\nduration ${(((film[i + 1]?.t ?? t1) - x.t) / 1000).toFixed(4)}`).join('\n')}\nfile '${film.at(-1)!.f}'\n`,
      );
      const duree = (t1 - td) / 1000;
      // —— sons : fondus de 50 ms aux bords de chaque fichier, posés à leur instant, mélangés
      const presents = J.sons.filter(([id]) => existsSync(join(SRC, `${id}.mp3`)));
      const absents = J.sons.filter(([id]) => !existsSync(join(SRC, `${id}.mp3`)));
      const mix = join(brut, 'mix.wav');
      const base = ['-y', '-hide_banner', '-loglevel', 'error'];
      if (presents.length) {
        const ins: string[] = [];
        const fa: string[] = [];
        presents.forEach(([id, t], i) => {
          const f = join(SRC, `${id}.mp3`);
          const d = dureeSon(f);
          ins.push('-i', f);
          fa.push(
            `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:d=0.05,afade=t=out:st=${Math.max(0, d - 0.05).toFixed(3)}:d=0.05,adelay=${Math.max(0, Math.round(t - td))}:all=1[a${i}]`,
          );
        });
        fa.push(
          `${presents.map((_, i) => `[a${i}]`).join('')}amix=inputs=${presents.length}:normalize=0:dropout_transition=0,apad=whole_dur=${duree.toFixed(3)}[a]`,
        );
        writeFileSync(join(brut, 'filtre.txt'), fa.join(';'));
        execFileSync('ffmpeg', [
          ...base,
          ...ins,
          '-filter_complex_script',
          join(brut, 'filtre.txt'),
          '-map',
          '[a]',
          '-t',
          duree.toFixed(3),
          mix,
        ]);
      } else
        execFileSync('ffmpeg', [
          ...base,
          '-f',
          'lavfi',
          '-i',
          'anullsrc=r=48000:cl=stereo',
          '-t',
          duree.toFixed(3),
          mix,
        ]);
      // —— -16 LUFS : loudnorm en deux passes (mesure, puis correction linéaire)
      const p1 = stderrDe([
        '-hide_banner',
        '-i',
        mix,
        '-af',
        'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
        '-f',
        'null',
        '-',
      ]);
      const L = JSON.parse(p1.slice(p1.lastIndexOf('{'), p1.lastIndexOf('}') + 1)) as Record<
        string,
        string
      >;
      const silence = !presents.length || !Number.isFinite(Number(L.input_i));
      const ln = silence
        ? 'anull'
        : `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${L.input_i}:measured_TP=${L.input_tp}:measured_LRA=${L.input_lra}:measured_thresh=${L.input_thresh}:offset=${L.target_offset}:linear=true,aresample=48000`;
      const mp4 = join(dir, `${nom}.mp4`);
      const [w, h] = [F.vp[0] * F.dpr, F.vp[1] * F.dpr];
      execFileSync(
        'ffmpeg',
        [
          ...base,
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          join(brut, 'images.txt'),
          '-i',
          mix,
          '-filter_complex',
          `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0xFBF7EE,fps=30,format=yuv420p[v];[1:a]${ln}[a]`,
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
          '-ac',
          '2',
          '-movflags',
          '+faststart',
          mp4,
        ],
        { stdio: 'inherit' },
      );
      // —— mesure finale (EBU R128)
      const r = stderrDe([
        '-hide_banner',
        '-i',
        mp4,
        '-af',
        'ebur128=peak=true',
        '-f',
        'null',
        '-',
      ]);
      const resume = r.slice(r.lastIndexOf('Summary'));
      const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(resume)?.[1]);
      const TP = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(resume)?.[1]);
      if (!silence) expect(Math.abs(I + 16), `intensité ${I} LUFS`).toBeLessThanOrEqual(1);
      // —— sous-titres (.srt) : traduction du livre de ce qui est dit, depuis le journal
      const st = J.st.map(([txt, t]) => ({ txt, t: (t - td) / 1000 }));
      const blocs: string[] = [];
      st.forEach((x, i) => {
        if (!x.txt) return;
        blocs.push(`${blocs.length + 1}\n${ts(x.t)} --> ${ts(st[i + 1]?.t ?? duree)}\n${x.txt}\n`);
      });
      writeFileSync(join(dir, `${nom}.fr.srt`), blocs.join('\n'));
      // —— chapitres YouTube (journal : sommaire, puis chaque intertitre) : le premier à 0:00 (carton compris) ; un
      // chapitre de moins de 10 s rejoint le précédent (règle de YouTube)
      const brutCh = J.ch.map(
        ([n, t], i) => [i === 0 ? 0 : (t - td) / 1000, n] as [number, string],
      );
      const chap = [...brutCh];
      for (;;) {
        const i = chap.findIndex(([s], k) => (chap[k + 1]?.[0] ?? duree) - s < 10);
        if (i < 0 || chap.length < 2) break;
        // trop court : il rejoint le précédent (le premier garde 0:00 et absorbe le suivant)
        chap.splice(i === 0 ? 1 : i, 1);
      }
      const muettes = J.scenes
        .map(([id, a], k) => ({ id, a, b: J.scenes[k + 1]?.[1] ?? t1 }))
        .filter((s) => !J.sons.some(([, t]) => t >= s.a && t < s.b))
        .map((s) => s.id);
      writeFileSync(
        join(dir, `${nom}.json`),
        JSON.stringify(
          {
            unite: e.unite,
            mode: e.mode,
            format: e.format,
            pixels: [w, h],
            version: 'v2',
            duree_s: Math.round(duree * 10) / 10,
            images: film.length,
            son: {
              cible: '-16 LUFS, crête -1,5 dBTP, fondus de 50 ms',
              avant: silence ? null : { I_LUFS: Number(L.input_i), crete_dBTP: Number(L.input_tp) },
              apres: { I_LUFS: I, crete_dBFS: TP },
            },
            chapitres_youtube: chap.map(([s, n]) => `${mmss(s)} ${n}`),
            chapitres_youtube_valides: chap.length >= 3 && chap[0]![0] === 0,
            chapitres: brutCh.map(([s, n]) => ({ a_s: Math.round(s * 10) / 10, nom: n })),
            sous_titres: blocs.length,
            sons: J.sons.map(([id, t]) => ({
              fichier: `${id}.mp3`,
              a_s: Math.round(t - td) / 1000,
              present: existsSync(join(SRC, `${id}.mp3`)),
            })),
            absents: absents.length,
            scenes: J.scenes.map(([id, t]) => ({ id, a_s: Math.round(t - td) / 1000 })),
            scenes_sans_son: muettes,
            reductions: J.zoom,
          },
          null,
          1,
        ),
      );
      // images effacées (le film reste)
      rmSync(brut, { recursive: true, force: true });
    });
});
