/**
 * Vidéos vivantes du cahier de lecture (25/10/2026) : générateur (mode « cahier » de la V2), synchronisation de la
 * voix et du surlignage, fidélité du texte au cahier (octet pour octet), garde coranique, aucune scène muette quand
 * un audio existe, préchargement limité, lecteur chargé à la demande derrière `cahier_lecture` ET `video_v2`.
 * Le test « liste réelle des audios » lit `~/lecons-audio/liste.csv` (comme le test « zéro muet ») : sauté sans elle.
 */
/* eslint-disable no-misleading-character-class -- signes combinants du Muṣḥaf voulus (garde coranique) */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONCTIONS } from '@awform/school';
import { audioFileId } from '@awform/content/audio-cle';
import {
  CAHIER_SANS_VIDEO,
  FACTEUR_REPETE,
  REPETE_MIN_MS,
  SANS_VOIX_MS,
  SOUFFLE_MS,
  buildVideoCahier,
  calendrier,
  dureeVideo,
  parLigne,
  unitesDe,
  type PageIn,
} from '@awform/content/video-cahier';
import { elementsDeLaPage, type Cahier, type Page } from '../cahier/donnees';
import { FACTEUR_PAUSE, SANS_AUDIO_MS } from '../cahier/lecture';
import { SANS_VIDEO } from '../cahier/outils';
import { PRECHARGEMENT, morceaux, titreH } from './lecteur-cahier';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const app = JSON.parse(lire('../../../static/cahier-data/ad1.json')) as Cahier;
const GARDE = new Set(
  (
    /VIDEO_GARDE =\s*'([^']*)'/.exec(
      lire('../../../../../packages/content/src/video-garde.ts'),
    )?.[1] ?? ''
  )
    .split(' ')
    .filter(Boolean),
);
const gardeCle = (s: string) => (audioFileId(s) ?? '').slice(0, 8);
const LISTE = process.env.AWFORM_LECONS_AUDIO_LISTE ?? join(homedir(), 'lecons-audio', 'liste.csv');
/** fichiers audio d'Adultes 1 de la liste réelle (sha1 des textes), null sans la liste */
const reels: Set<string> | null = existsSync(LISTE)
  ? new Set(
      readFileSync(LISTE, 'utf8')
        .split('\n')
        .slice(1)
        .map((l) => l.split(';'))
        .filter((c) => (c[5] ?? '').split(' ').includes('ad1'))
        .map((c) => c[0]!),
    )
  : null;

const toutes: Page[] = app.pages;
const avecVideo = toutes.filter((p) => !CAHIER_SANS_VIDEO.includes(p.type));
/** le texte a un fichier : toutes les pistes de synthèse existent (hors texte coranique, comme `audioIdFor`) */
const toutVoix = (s: string) => !/[ۖ-ۭٱࣰ-ࣲ]/.test(s);
const video = (p: Page, hasAudio: (s: string) => boolean = toutVoix) =>
  buildVideoCahier(p as unknown as PageIn, { hasAudio });
const brut = (h: string) =>
  h
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

describe('vidéos du cahier : fidélité au cahier (octet pour octet)', () => {
  it('les éléments de la vidéo sont ceux de la lecture guidée du cahier, dans le même ordre', () => {
    let n = 0;
    for (const p of avecVideo) {
      const v = video(p);
      const vus = unitesDe(v)
        .filter((u) => !u.etiquette)
        .map((u) => ({
          cle: u.cle,
          ar: u.ar,
          a: u.a,
          ...(u.a === 'q' && u.ref ? { ref: u.ref } : {}),
        }));
      const attendus = elementsDeLaPage(p).map(({ cle, el }) => ({
        cle,
        ar: el.ar,
        a: el.a,
        ...(el.a === 'q' && el.ref ? { ref: el.ref } : {}),
      }));
      expect(vus, p.id).toEqual(attendus);
      n += vus.length;
    }
    expect(n).toBeGreaterThan(1500);
  });
  it('texte arabe jamais normalisé (pas de NFC) : les graphies du cahier arrivent telles quelles', () => {
    const tous = avecVideo.flatMap((p) => elementsDeLaPage(p).map((x) => x.el.ar));
    // le cahier garde des graphies que NFC changerait (alif waṣla, suites chadda-voyelle) : le test est utile
    // eslint-disable-next-line no-restricted-syntax -- le test PROUVE que NFC changerait le texte ; rien n'est normalisé
    expect(tous.some((s) => s !== s.normalize('NFC'))).toBe(true);
    const vus = avecVideo.flatMap((p) =>
      unitesDe(video(p))
        .filter((u) => !u.etiquette)
        .map((u) => u.ar),
    );
    expect(vus).toEqual(tous);
  });
  it('la mise en couleur ne change pas le texte (découpe de l’affichage seulement)', () => {
    let avecCouleur = 0;
    for (const p of avecVideo)
      for (const u of unitesDe(video(p))) {
        expect(brut(morceaux(u)), u.cle).toBe(u.ar);
        if (u.c?.length) avecCouleur++;
      }
    expect(avecCouleur).toBeGreaterThan(100);
  });
  it('titres et libellés français du cahier : identiques, arabe cité sur sa ligne', () => {
    for (const p of avecVideo) {
      const v = video(p);
      v.scenes.forEach((sc) => {
        const b = p.blocs.find((x, i) => `${p.id}.${i}` === sc.id);
        const attendu = b ? b.titre : p.titre;
        expect(sc.titre, sc.id).toBe(attendu);
        expect(brut(titreH(sc.titre)), sc.id).toBe(sc.titre);
        for (const l of sc.lignes) if (l.titre) expect(brut(titreH(l.titre)), sc.id).toBe(l.titre);
      });
    }
    // lettres citées une à une : dans la phrase ; un mot arabe : sur sa propre ligne
    const c = String.fromCharCode;
    const lettres = `Leçon 6 : ${c(0x643)} ${c(0x644)} ${c(0x645)} ${c(0x647)}`;
    expect(titreH(lettres)).toContain('<bdi class="lt"');
    expect(titreH(lettres)).not.toContain('ar-l');
    const mot = `Le mot ${c(0x643, 0x64e, 0x62a, 0x64e, 0x628, 0x64e)} veut dire`;
    expect(titreH(mot)).toContain('<span class="ar-l"');
    expect(brut(titreH(mot))).toBe(mot);
  });
  it('aucune phonétique latine ni visage : seulement les textes du cahier', () => {
    for (const p of avecVideo)
      for (const u of unitesDe(video(p))) {
        expect(u.ar, u.cle).not.toMatch(/[A-Za-z]/);
      }
    const src = lire('./lecteur-cahier.ts');
    expect(src).not.toMatch(/<img|<image|\.png|\.svg\b|\.jpg/);
  });
});

describe('vidéos du cahier : voix, garde coranique, aucune scène muette', () => {
  it('jamais de synthèse sur le Coran : un élément « q » n’est jamais confié à un fichier de synthèse', () => {
    let q = 0;
    for (const p of avecVideo)
      for (const u of unitesDe(video(p))) {
        if (u.a === 'q') {
          q++;
          expect(u.voix === 'recitation' || u.voix === 'aucune', `${p.id} ${u.cle}`).toBe(true);
        }
        if (GARDE.has(gardeCle(u.ar))) expect(u.voix, `${p.id} ${u.cle}`).not.toBe('oui');
      }
    expect(q).toBeGreaterThan(30);
    // les récitations ont une référence de verset
    for (const p of avecVideo)
      for (const u of unitesDe(video(p)))
        if (u.voix === 'recitation') expect(u.ref).toMatch(/^\d{1,3}:\d{1,3}$/);
  });
  it('texte coranique (signes du Muṣḥaf) : aucun fichier, donc aucune voix de synthèse', () => {
    const coran = 'ٱلْحَمْدُ لِلَّهِ';
    const v = buildVideoCahier(
      {
        id: 'X',
        titre: 'x',
        type: 'mots',
        blocs: [{ type: 'mots', titre: 't', el: [{ ar: coran, a: 't' }] }],
      },
      { hasAudio: () => false },
    );
    expect(unitesDe(v)[0]!.voix).toBe('absent');
    // même si un fichier existait par erreur, la garde de la vidéo le couvre pour les textes gardés
    const garde = new Set([gardeCle(coran)]);
    const v2 = buildVideoCahier(
      {
        id: 'X',
        titre: 'x',
        type: 'mots',
        blocs: [{ type: 'mots', titre: 't', el: [{ ar: coran, a: 't' }] }],
      },
      { hasAudio: () => true, garde },
    );
    expect(unitesDe(v2)[0]!.voix).toBe('garde');
    expect(v2.sansVoix).toEqual([{ ar: coran, voix: 'garde' }]);
  });
  it('aucune scène muette quand un audio existe (fichiers simulés pour tout texte non coranique)', () => {
    for (const p of avecVideo) {
      const v = video(p);
      for (const sc of v.scenes) {
        const us = sc.lignes.flatMap((l) => l.unites);
        const dicibles = us.filter((u) => u.a !== 'q' && !GARDE.has(gardeCle(u.ar)));
        // un texte qui a un fichier est dit
        for (const u of dicibles) expect(u.voix, `${p.id} ${u.cle}`).toBe('oui');
        // une scène n’est muette que si tout ce qu’elle montre est gardé (Coran sans référence, garde)
        if (us.some((u) => u.voix === 'oui' || u.voix === 'recitation')) continue;
        for (const u of us)
          expect(u.voix === 'garde' || u.voix === 'aucune', `${p.id} ${sc.id} ${u.cle}`).toBe(true);
      }
    }
  });
  it.skipIf(!reels)(
    'liste réelle des audios d’Adultes 1 : « oui » exactement quand le fichier existe (hors garde et récitation)',
    () => {
      const hasAudio = (s: string) => toutVoix(s) && reels!.has(audioFileId(s) ?? '');
      let oui = 0;
      const absents: string[] = [];
      for (const p of avecVideo) {
        const v = buildVideoCahier(p as unknown as PageIn, { hasAudio });
        for (const u of unitesDe(v)) {
          if (u.a === 'q') continue;
          const existe = hasAudio(u.ar);
          const garde = GARDE.has(gardeCle(u.ar));
          // un fichier existe et n’est pas gardé : il est dit ; sinon il ne l’est pas
          expect(u.voix === 'oui', `${p.id} ${u.cle}`).toBe(existe && !garde);
          if (u.voix === 'oui') oui++;
          else absents.push(`${p.id} ${u.cle}`);
        }
        // une scène qui montre un texte ayant son fichier n’est jamais muette
        for (const sc of v.scenes) {
          const us = sc.lignes.flatMap((l) => l.unites);
          if (us.some((u) => u.a !== 'q' && hasAudio(u.ar) && !GARDE.has(gardeCle(u.ar))))
            expect(
              us.some((u) => u.voix === 'oui'),
              `${p.id} ${sc.id}`,
            ).toBe(true);
        }
      }
      expect(oui).toBeGreaterThan(1000);
      // rapport (non bloquant) : ce que la liste n’a pas encore
      if (process.env.VIDEO_CAHIER_RAPPORT)
        console.log(`sans fichier : ${absents.length}`, absents.slice(0, 20));
    },
  );
  it('pas de vidéo pour le bilan à froid, la minute chronométrée et le guide', () => {
    const sans = toutes.filter((p) => CAHIER_SANS_VIDEO.includes(p.type));
    expect(sans.length).toBeGreaterThan(10);
    for (const p of sans) expect(video(p).scenes, p.id).toEqual([]);
    for (const p of avecVideo)
      if (elementsDeLaPage(p).length) expect(video(p).scenes.length, p.id).toBeGreaterThan(0);
  });
});

describe('vidéos du cahier : mise en lignes (grille, tableau, lettres liées)', () => {
  const page = (id: string) => toutes.find((p) => p.id === id)!;
  it('une grille se lit ligne par ligne : une ligne par rang, numérotée, de droite à gauche', () => {
    const p = page('P047');
    const v = video(p);
    const sc = v.scenes.find((s) => s.bloc === 'grille')!;
    const rangs = p.blocs.find((b) => b.type === 'grille')!.el;
    expect(sc.lignes.length).toBe(rangs.length);
    sc.lignes.forEach((l, i) => {
      expect(l.rang).toBe(i + 1);
      expect(l.unites.length).toBe(3);
    });
    // le lecteur affiche chaque ligne en direction droite à gauche, la flèche avance vers la gauche
    const css = lire('./lecteur-cahier.css');
    const ts = lire('./lecteur-cahier.ts');
    expect(ts).toContain('class="vc-r" dir="rtl"');
    expect(ts).toContain('M20 12H5M11 6l-6 6 6 6');
    expect(css).toMatch(/\.vc-fl[\s\S]*right: 0/);
  });
  it('un tableau : la lettre du rang (étiquette), puis ses syllabes ; hors lecture guidée', () => {
    const v = video(page('P003'));
    const sc = v.scenes[0]!;
    expect(sc.lignes.length).toBe(28);
    for (const l of sc.lignes) {
      expect(l.unites[0]!.etiquette).toBe(true);
      expect(l.unites.slice(1).every((u) => !u.etiquette)).toBe(true);
      expect(l.unites.length).toBe(4);
    }
  });
  it('lettres séparées puis mot lié : une ligne de syllabes, puis le mot sur sa ligne', () => {
    const p = toutes.find((x) => x.blocs.some((b) => b.type === 'lier'))!;
    const sc = video(p).scenes.find((s) => s.bloc === 'lier')!;
    const bloc = p.blocs.find((b) => b.type === 'lier')!;
    expect(sc.lignes.length).toBe(bloc.el.length * 2);
    sc.lignes.forEach((l, i) => {
      const e = bloc.el[Math.floor(i / 2)] as { ar: string; sep: string[] };
      if (i % 2 === 0) expect(l.unites.map((u) => u.ar)).toEqual(e.sep);
      else expect(l.unites.map((u) => u.ar)).toEqual([e.ar]);
    });
  });
  it('listes plates : lignes de 3 syllabes, de 4 lettres ; mots selon leur longueur ; phrases une par une', () => {
    const syl = video(page('P004')).scenes[0]!;
    expect(syl.lignes.every((l) => l.unites.length <= 3)).toBe(true);
    expect(syl.lignes[0]!.unites.length).toBe(3);
    const alpha = video(page('P002')).scenes[0]!;
    expect(alpha.lignes[0]!.unites.length).toBe(4);
    expect(parLigne([{ ar: 'x'.repeat(5), genre: 'mot' }])).toBe(3);
    expect(parLigne([{ ar: 'x'.repeat(12), genre: 'mot' }])).toBe(2);
    expect(parLigne([{ ar: 'x'.repeat(20), genre: 'mot' }])).toBe(1);
    expect(parLigne([{ ar: 'x', genre: 'phrase' }])).toBe(1);
    for (const p of avecVideo)
      for (const sc of video(p).scenes)
        for (const l of sc.lignes) expect(l.unites.length).toBeLessThanOrEqual(6);
  });
  it('les durées prévues restent raisonnables (une page, quelques minutes)', () => {
    let max = 0;
    let idMax = '';
    for (const p of avecVideo) {
      const d = dureeVideo(video(p));
      if (d > max) [max, idMax] = [d, p.id];
    }
    if (process.env.VIDEO_CAHIER_RAPPORT)
      console.log(`plus longue : ${idMax} ${Math.round(max / 1000)} s`);
    expect(max).toBeLessThan(15 * 60_000);
  });
  it('générique : un cahier d’un autre niveau et d’autres types de blocs donne les mêmes scènes', () => {
    const autre: PageIn = {
      id: 'E007',
      titre: 'Page de test',
      type: 'quelconque',
      blocs: [
        {
          type: 'syllabes_en',
          titre: 'Les syllabes',
          el: Array.from({ length: 7 }, () => ({ ar: 'بَ', a: 's' })),
        },
        {
          type: 'rangs_ado',
          titre: 'Les rangs',
          el: [{ titre: 'r1', el: [{ ar: 'بِ', a: 's' }] }],
        },
      ],
    };
    const v = buildVideoCahier(autre, { hasAudio: () => true });
    expect(v.scenes.map((s) => s.lignes.length)).toEqual([3, 1]);
    expect(v.nUnites).toBe(8);
    // rien d’Adultes 1 dans le générateur ni dans le lecteur
    for (const f of [
      '../../../../../packages/content/src/video-cahier.ts',
      './lecteur-cahier.ts',
    ]) {
      const code = lire(f)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/\b(ad1|ado1|en1|P\d{3})\b/);
    }
    expect(lire('../../../../../packages/content/src/video-cahier.ts')).not.toMatch(/[؀-ۿ]/);
  });
});

describe('vidéos du cahier : synchronisation de la voix, du surlignage et de la pause', () => {
  it('même règle que la lecture guidée du cahier : pause de 1,5 fois la durée, 2 s sans voix', () => {
    expect(FACTEUR_REPETE).toBe(FACTEUR_PAUSE);
    expect(SANS_VOIX_MS).toBe(SANS_AUDIO_MS);
    expect(REPETE_MIN_MS).toBe(2000);
  });
  it('calendrier : chaque élément s’allume à son tour, puis la flèche refait le chemin pendant la pause', () => {
    const c = calendrier([1000, 1400, 800], true);
    // écoute : contiguë, un souffle entre deux éléments
    expect(c.ecoute).toEqual([
      { i: 0, de: 0, a: 1000 },
      { i: 1, de: 1000 + SOUFFLE_MS, a: 2400 + SOUFFLE_MS },
      { i: 2, de: 2400 + 2 * SOUFFLE_MS, a: 3200 + 2 * SOUFFLE_MS },
    ]);
    const ecoute = 3200 + 3 * SOUFFLE_MS;
    const pause = Math.round(ecoute * FACTEUR_REPETE);
    // répétition : commence quand l’écoute finit, au prorata, et dure 1,5 fois l’écoute
    expect(c.repete[0]!.de).toBe(ecoute);
    expect(c.repete.at(-1)!.a).toBeGreaterThanOrEqual(ecoute + pause - 2);
    expect(c.repete.at(-1)!.a).toBeLessThanOrEqual(ecoute + pause + 2);
    for (let i = 1; i < c.repete.length; i++) expect(c.repete[i]!.de).toBe(c.repete[i - 1]!.a);
    expect(c.repete[1]!.a - c.repete[1]!.de).toBeGreaterThan(c.repete[2]!.a - c.repete[2]!.de);
    expect(c.fin).toBeCloseTo(ecoute + pause, -1);
    // une syllabe très courte : au moins 2 s pour répéter
    const court = calendrier([300], true);
    expect(court.repete[0]!.a - court.repete[0]!.de).toBe(REPETE_MIN_MS);
    // aucune voix (texte sans fichier) : l’élève lit, pas de pause de répétition
    expect(calendrier([SANS_VOIX_MS], false).repete).toEqual([]);
  });
  it('le lecteur allume l’élément au son exact (événement « playing »), pas avant', () => {
    const ts = lire('./lecteur-cahier.ts');
    expect(ts).toMatch(/a\.onplaying = \(\) => \{[\s\S]*?marquer\(n\);/);
    // la ligne n’est lue qu’élément par élément, dans l’ordre du cahier (de droite à gauche à l’écran)
    expect(ts).toMatch(
      /for \(let i = 0; i < l\.unites\.length; i\+\+\) \{\s*d\.push\(\(await dire\(n0 \+ i\)\)/,
    );
    // pause de répétition ensuite, puis la ligne suivante
    expect(ts).toMatch(/calendrier\(d, l\.unites\.some\(sonnee\)\)/);
    expect(ts).toMatch(/await jouerLigne\(g\)/);
  });
});

describe('vidéos du cahier : règles de la V2 (préchargement, animations, textes, chargement à la demande)', () => {
  it('préchargement limité à 4 fichiers à la fois, comme le correctif V2', () => {
    expect(PRECHARGEMENT).toBe(4);
    const ts = lire('./lecteur-cahier.ts');
    expect(ts).toMatch(/k < n \+ PRECHARGEMENT/);
    expect(ts).toMatch(/if \(k < n \|\| k >= n \+ PRECHARGEMENT\) relacher\(k\)/);
    // le correctif V2 : quatre lectures à la fois
    expect(lire('./lecteur-v2.ts')).toMatch(/Promise\.all\(\[un\(\), un\(\), un\(\), un\(\)\]\)/);
  });
  it('animations sur transform et opacity seulement ; animations réduites : fondus seuls', () => {
    const css = lire('./lecteur-cahier.css').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/transition:\s*([^;]+);/g))
      for (const part of m[1]!.split(','))
        expect(['transform', 'opacity'], m[0]).toContain(part.trim().split(/\s+/)[0]);
    const cles = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)];
    expect(cles.length).toBeGreaterThanOrEqual(2);
    for (const [, nom, corps] of cles)
      for (const d of corps!.matchAll(/([\w-]+)\s*:/g))
        expect(['transform', 'opacity'], `${nom} : ${d[1]}`).toContain(d[1]);
    expect(lire('./lecteur-cahier.ts')).not.toMatch(
      /style\.(width|height|left|top|margin|padding)\s*=/,
    );
    const reduit = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduit).toMatch(/animation: vc-fondu/);
    expect(reduit).toMatch(/\.vc-u\.joue[\s\S]*transform: none/);
  });
  it('textes d’interface : français tutoyé et brouillons en, es, de, ar ; clés du lecteur toutes définies', () => {
    const fr = JSON.parse(lire('../../../static/i18n/fr-video.json')) as Record<string, string>;
    const cah = JSON.parse(lire('../cahier/textes-fr.json')) as Record<string, string>;
    expect(fr['vv.cah_repete']).toBe('À toi : répète');
    expect(cah['cahier.regarder']).toBe('Regarder la vidéo');
    for (const l of ['en', 'es', 'de', 'ar']) {
      const j = JSON.parse(lire(`../../../static/i18n/${l}.json`)) as Record<string, string>;
      for (const k of [
        'vv.cah_titre',
        'vv.cah_ecoute',
        'vv.cah_repete',
        'vv.cah_ligne',
        'cahier.regarder',
      ])
        expect(j[k], `${l} ${k}`).toBeTruthy();
    }
    const ts = lire('./lecteur-cahier.ts');
    const utilisees = new Set([...ts.matchAll(/'(vv\.[a-z_]+)'/g)].map((m) => m[1]!));
    expect(utilisees.size).toBeGreaterThan(8);
    for (const k of utilisees) expect(fr[k], k).toBeTruthy();
  });
  it('bouton « Regarder la vidéo » : derrière cahier_lecture ET video_v2, aucun nouvel interrupteur', () => {
    const route = lire('../../routes/cahier/[niveau]/+page.svelte');
    // la route n'ouvre la page du cahier que si cahier_lecture est ouvert, et ne donne l'ouverture de la vidéo que si video_v2 l'est
    expect(route).toMatch(/fn\('cahier_lecture'\) && CAHIER_NIVEAUX/);
    expect(route).toMatch(/fn\('video_v2'\)\s*\?\s*\(o: OuvrirCahierOptions\)/);
    const pv = lire('../cahier/PageVue.svelte');
    expect(pv).toMatch(/!!ouvrirVideo && !SANS_VIDEO\.includes\(page\.type\)/);
    expect(pv).toContain('data-testid="voir-video-cahier"');
    expect(
      Object.keys(FONCTIONS)
        .filter((k) => /video|cahier/.test(k))
        .sort(),
    ).toEqual(['cahier_lecture', 'cahier_parler', 'video_v2', 'video_vivante'].sort());
    expect(FONCTIONS.video_v2).toEqual({ defaut: 'off', demo: 'on' });
    expect(FONCTIONS.cahier_lecture).toEqual({ defaut: 'off', demo: 'on' });
  });
  it('lecteur chargé à la demande : jamais importé statiquement par le cahier ni la coquille', () => {
    const route = lire('../../routes/cahier/[niveau]/+page.svelte');
    expect(route).toMatch(/chargerModule\(\(\) => import\('\$lib\/video\/lecteur-cahier'\)\)/);
    for (const f of [
      '../cahier/PageVue.svelte',
      '../cahier/Cahier.svelte',
      '../cahier/index.ts',
      '../cahier/audio.ts',
      '../cahier/outils.ts',
      '../../routes/cahier/[niveau]/+page.svelte',
    ]) {
      const src = lire(f);
      // seuls des types (effacés à la construction) viennent du lecteur
      expect(src, f).not.toMatch(/^\s*import (?!type)[^;]*from '\$lib\/video\//m);
      expect(src, f).not.toMatch(
        /^\s*import (?!type)[^;]*from '@awform\/content\/video(-cahier)?'/m,
      );
    }
    // le cahier ne partage aucun module avec le lecteur de vidéo (sinon la construction les lierait) : copie gardée
    expect(SANS_VIDEO).toEqual(CAHIER_SANS_VIDEO);
    expect(lire('../cahier/PageVue.svelte')).not.toContain('@awform/content/video');
    // construction : le lecteur et son générateur rejoignent le groupe « vidéos » (/_app/video.json), jamais préchargé
    expect(lire('../../../vite.config.ts')).toMatch(/video\(-garde\|-cahier\)\?/);
    expect(lire('../../../scripts/budget.mjs')).toContain(
      "vidDe('src/lib/video/lecteur-cahier.ts')",
    );
  });
});
