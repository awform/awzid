/**
 * « Mots du Coran » (interrupteur `coran_mots`) — calcul de « Je reconnais X % des mots », soulignement, fidélité du texte.
 *  - le pourcentage reproduit, mot pour mot et sourate par sourate, la couverture calculée à part par l'étude (114 sourates,
 *    10 niveaux) ;
 *  - il suit la progression RÉELLE de l'élève (leçons faites, niveaux dépassés, mots validés), pas un niveau théorique ;
 *  - « prochaine étape » : mots enseignés par les livres, choisis un à un, qui font vraiment gagner des mots ;
 *  - le texte coranique reste identique d'un octet avec ou sans soulignement (on n'ajoute qu'une classe de style) ;
 *  - le repérage des mots tient sur les 6 236 versets de Tanzil (jamais de soulignement décalé) ;
 *  - aucune synthèse vocale sur un verset : le module n'en contient aucune.
 * Les vérifications qui lisent le vrai Tanzil sont ignorées s'il est absent (CI).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { render } from 'svelte/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadTanzil } from '@awform/content';
import { tanwinDisplay } from '@awform/content/text';
import { splitBasmala } from '@awform/hifz';
import QuranText from '$lib/quran/QuranText.svelte';
import {
  drapeaux,
  estReconnu,
  mesurer,
  niveauDe,
  numeroDe,
  pourcent,
  prochaineEtape,
  rangsConnus,
  type Entree,
  type Rangs,
} from './calcul';

const DATA = fileURLToPath(new URL('../../../../../packages/coran-mots-data/', import.meta.url));
const lire = (nom: string) => readFileSync(join(DATA, nom), 'utf8');
const rangs = JSON.parse(lire('data/rangs.json')) as Rangs;
const sourate = (s: number) =>
  (JSON.parse(lire(`data/sourates/${String(s).padStart(3, '0')}.json`)) as { v: Entree[][] }).v;
/** arrondi à une décimale, au pair le plus proche sur un milieu exact (comme `[math]::Round` du script de l'étude) */
const arrondi1 = (x: number) => {
  const y = x * 10;
  const f = Math.floor(y);
  const d = y - f;
  return (d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1) / 10;
};
const TANZIL = join(
  process.env.AWFORM_CONTENT_DIR ?? join(homedir(), 'awform-content'),
  'coran',
  'tanzil-uthmani.tsv',
);
const tanzil = existsSync(TANZIL) ? loadTanzil(readFileSync(TANZIL, 'utf8')) : null;

interface Ref {
  global: Array<{ niveau: number; pct_mots: number; pct_mots_pleins: number }>;
  sourates: Array<{
    sourate: number;
    mots: number;
    niveaux: Array<{
      niveau: number;
      mots: number;
      mots_compris: number;
      pct_mots: number;
      pct_mots_pleins: number;
    }>;
  }>;
}
const ref = JSON.parse(
  gunzipSync(readFileSync(join(DATA, 'reference', 'couverture.json.gz'))).toString('utf8'),
) as Ref;

/** Un élève qui vient de finir le niveau N sans leçon du suivant : niveau courant N + 1, aucune leçon faite. */
const finiN = (n: number) => rangsConnus(rangs, { niveau: n + 1, unites: [], valides: [] });

describe('calcul de « Je reconnais X % des mots » : la couverture de l’étude, reproduite', () => {
  it('114 sourates × 10 niveaux : mêmes mots comptés, mêmes mots reconnus, mêmes pourcentages', () => {
    let comparaisons = 0;
    for (let n = 1; n <= 10; n++) {
      const connus = finiN(n);
      let mots = 0;
      let compris = 0;
      let pleins = 0;
      let pleinsCompris = 0;
      for (let s = 1; s <= 114; s++) {
        const m = mesurer(sourate(s), connus);
        const attendu = ref.sourates[s - 1]!.niveaux[n - 1]!;
        expect(m.mots, `${s} N${n}`).toBe(attendu.mots);
        expect(m.compris, `${s} N${n}`).toBe(attendu.mots_compris);
        expect(arrondi1(pourcent(m.compris, m.mots)), `${s} N${n}`).toBeCloseTo(
          attendu.pct_mots,
          1,
        );
        expect(arrondi1(pourcent(m.pleinsCompris, m.pleins)), `${s} N${n} pleins`).toBeCloseTo(
          attendu.pct_mots_pleins,
          1,
        );
        mots += m.mots;
        compris += m.compris;
        pleins += m.pleins;
        pleinsCompris += m.pleinsCompris;
        comparaisons++;
      }
      // le Coran entier (étude : 48,6 % à la fin du N1 … 88,5 % à la fin du N10)
      const g = ref.global[n - 1]!;
      expect(arrondi1(pourcent(compris, mots))).toBeCloseTo(g.pct_mots, 1);
      expect(arrondi1(pourcent(pleinsCompris, pleins))).toBeCloseTo(g.pct_mots_pleins, 1);
    }
    expect(comparaisons).toBe(1140);
    expect(arrondi1(pourcent(mesurer(sourate(1), finiN(1)).compris, 29))).toBe(58.6); // al-Fātiḥa, N1
  });

  it('les chiffres cités par l’étude (§ 2) : 48,6 % au N1, 61,0 % au N2, 88,5 % au N10 ; al-Falaq bloquée à 69,6 %', () => {
    const tout = (n: number) => {
      let c = 0;
      let m = 0;
      for (let s = 1; s <= 114; s++) {
        const r = mesurer(sourate(s), finiN(n));
        c += r.compris;
        m += r.mots;
      }
      return arrondi1(pourcent(c, m));
    };
    expect([tout(1), tout(2), tout(10)]).toEqual([48.6, 61.0, 88.5]);
    const falaq = (n: number) => arrondi1(pourcent(mesurer(sourate(113), finiN(n)).compris, 23));
    expect([falaq(1), falaq(5), falaq(10)]).toEqual([69.6, 69.6, 69.6]);
  });

  it('suit la progression RÉELLE : niveau courant, leçons faites, mots validés ; rien d’inventé', () => {
    const pct = (c: Set<number>, s = 2) => {
      const m = mesurer(sourate(s), c);
      return pourcent(m.compris, m.mots);
    };
    const debut3 = rangsConnus(rangs, { niveau: 3, unites: [], valides: [] });
    const fini3 = finiN(3);
    // quelques leçons du niveau 3 faites : entre « début du niveau 3 » et « fin du niveau 3 »
    const unites = Object.entries(rangs)
      .map(([r, e]) => ({ r: Number(r), u: e?.[1] ?? '' }))
      .filter((x) => niveauDe(x.u) === 3)
      .map((x) => x.u);
    const faites = [...new Set(unites)].slice(0, 6);
    const enCours = rangsConnus(rangs, { niveau: 3, unites: faites, valides: [] });
    expect(faites).toHaveLength(6);
    expect(enCours.size).toBeGreaterThan(debut3.size);
    expect(enCours.size).toBeLessThan(fini3.size);
    expect(pct(enCours)).toBeGreaterThanOrEqual(pct(debut3));
    expect(pct(enCours)).toBeLessThanOrEqual(pct(fini3));
    // exactement les rangs des niveaux précédents plus ceux des leçons faites
    const attendu = new Set<number>();
    rangs.forEach((e, r) => {
      const u = e?.[1];
      if (u && (niveauDe(u) < 3 || faites.includes(u))) attendu.add(r);
    });
    expect(enCours).toEqual(attendu);
    // une leçon « commencée » ou d’un autre niveau n’est pas comptée ; un mot validé l’est
    const sansLecon = rangsConnus(rangs, { niveau: 3, unites: ['ad9.l01'], valides: [] });
    expect(
      [...sansLecon].every((r) => niveauDe(rangs[r]![1]!) < 3 || rangs[r]![1] === 'ad9.l01'),
    ).toBe(true);
    const rang = [...fini3].find((r) => !debut3.has(r))!;
    expect(rangsConnus(rangs, { niveau: 3, unites: [], valides: [rang] }).has(rang)).toBe(true);
    expect(debut3.has(rang)).toBe(false);
    // un élève qui n’a rien fait ne reconnaît que ce que les niveaux précédents ont enseigné (niveau 1 : rien)
    expect(rangsConnus(rangs, { niveau: 1, unites: [], valides: [] }).size).toBe(0);
    expect(pct(rangsConnus(rangs, { niveau: 1, unites: [], valides: [] }), 1)).toBe(0);
  });

  it('un mot est reconnu si TOUS ses lemmes le sont ; les lettres isolées ne comptent pas', () => {
    const connus = new Set([5, 7]);
    expect(estReconnu(5 * 2, connus)).toBe(true);
    expect(estReconnu([5 * 2, 7 * 2 + 1], connus)).toBe(true);
    expect(estReconnu([5 * 2, 8 * 2], connus)).toBe(false);
    expect(estReconnu(0, connus)).toBe(false); // lemme absent de la liste des 1 000
    expect(estReconnu(-1, new Set([0]))).toBe(false);
    const m = mesurer([[-1, 10, [10, 14], 2 * 5 + 1, 0]], new Set([5, 7]));
    // 10 : lemme 5 (particule) ; [10, 14] : lemmes 5 et 7 ; 11 : lemme 5 (nom) ; 0 : lemme absent de la liste
    expect(m).toEqual({ mots: 4, compris: 3, pleins: 1, pleinsCompris: 1 });
    expect(pourcent(0, 0)).toBe(0);
    expect(niveauDe('ad3.l12')).toBe(3);
    expect(numeroDe('ad3.l12')).toBe(12);
  });
});

describe('prochaine étape : « ces N mots te feraient passer à Y % »', () => {
  const cas: Array<[number, number]> = [
    [1, 1],
    [36, 1],
    [67, 2],
    [78, 1],
    [112, 1],
    [113, 3],
    [2, 2],
  ];
  it('mots enseignés par les livres, au plus 5, qui font gagner des mots ; Y = pourcentage une fois appris', () => {
    for (const [s, n] of cas) {
      const connus = finiN(n);
      const v = sourate(s);
      const avant = mesurer(v, connus);
      const e = prochaineEtape(v, connus, rangs);
      expect(e.rangs.length, `${s} N${n}`).toBeLessThanOrEqual(5);
      for (const r of e.rangs) {
        expect(connus.has(r), `${s} N${n} rang ${r} déjà connu`).toBe(false);
        expect(rangs[r]?.[1], `${s} N${n} rang ${r} jamais enseigné`).toBeTruthy();
      }
      const apres = mesurer(v, new Set([...connus, ...e.rangs]));
      expect(e.apres).toEqual(apres);
      if (e.rangs.length) expect(apres.compris).toBeGreaterThan(avant.compris);
      // chaque mot choisi apporte quelque chose : sans lui, moins de mots reconnus
      for (const r of e.rangs) {
        const sans = mesurer(v, new Set([...connus, ...e.rangs.filter((x) => x !== r)]));
        expect(sans.compris, `${s} N${n} rang ${r}`).toBeLessThan(apres.compris);
      }
    }
  });

  it('le premier mot proposé est celui qui fait gagner le plus de mots (essai exhaustif)', () => {
    for (const [s, n] of cas) {
      const connus = finiN(n);
      const v = sourate(s);
      const e = prochaineEtape(v, connus, rangs, 1);
      if (!e.rangs.length) continue;
      const base = mesurer(v, connus).compris;
      let meilleur = 0;
      for (const [r, ent] of rangs.entries())
        if (ent?.[1] && !connus.has(r))
          meilleur = Math.max(meilleur, mesurer(v, new Set([...connus, r])).compris - base);
      expect(e.apres.compris - base, `${s} N${n}`).toBe(meilleur);
    }
  });

  it('al-Fātiḥa à la fin du N1 : la prochaine étape fait passer de 58,6 % à plus', () => {
    const connus = finiN(1);
    const e = prochaineEtape(sourate(1), connus, rangs);
    expect(e.rangs.length).toBeGreaterThan(0);
    expect(pourcent(e.apres.compris, e.apres.mots)).toBeGreaterThan(58.6);
  });

  it('plus rien à apporter : liste vide, mesure inchangée', () => {
    const tous = new Set<number>();
    rangs.forEach((e, r) => e?.[1] && tous.add(r));
    const v = sourate(1);
    const e = prochaineEtape(v, tous, rangs);
    expect(e.rangs).toEqual([]);
    expect(e.apres).toEqual(mesurer(v, tous));
  });
});

describe('soulignement : repérage des mots dans le texte de Tanzil', () => {
  it('les signes de pause isolés ne sont pas des mots ; un décalage ne souligne RIEN', () => {
    const connus = new Set([5]);
    const ws = ['كَلِمَة', 'ۖ', 'ثَانِيَة', 'ۗ', 'ثَالِثَة'];
    expect(drapeaux(ws, [10, 12, 10], connus)).toEqual([true, false, false, false, true]);
    // un mot de trop ou de moins : aucun repérage (jamais un soulignement sous le mauvais mot)
    expect(drapeaux(ws, [10, 12], connus)).toBeUndefined();
    expect(drapeaux(ws, [10, 12, 10, 10], connus)).toBeUndefined();
    expect(drapeaux(ws, undefined, connus)).toBeUndefined();
    // ۞ (début de ḥizb) n'est pas un mot non plus
    expect(drapeaux(['۞', 'كَلِمَة'], [10], connus)).toEqual([false, true]);
  });

  it.skipIf(!tanzil)(
    'sur les 6 236 versets de Tanzil, chaque verset (basmala d’en-tête retirée) a autant de mots que de données',
    () => {
      const basmala = tanzil!.get('1:1')!;
      let versets = 0;
      let mauvais = 0;
      for (let s = 1; s <= 114; s++) {
        const v = sourate(s);
        v.forEach((entrees, i) => {
          const { rest } = splitBasmala(s, i + 1, tanzil!.get(`${s}:${i + 1}`)!, basmala);
          if (!drapeaux(rest.split(' '), entrees, new Set())) mauvais++;
          versets++;
        });
      }
      expect(versets).toBe(6236);
      expect(mauvais).toBe(0);
    },
  );
});

describe('le texte du Coran reste intact : on n’ajoute qu’une classe de style', () => {
  const sansBalises = (h: string) => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '');
  // versets reconstitués depuis les formes de Tanzil (mots.tsv) si le fichier de Tanzil n'est pas là
  const formes = new Map<string, string[]>();
  for (const l of lire('data/mots.tsv').split('\n').filter(Boolean)) {
    const [ref, forme] = l.split('\t') as [string, string];
    const k = ref.split(':').slice(0, 2).join(':');
    formes.set(k, [...(formes.get(k) ?? []), forme]);
  }
  const verset = (s: number, a: number) =>
    tanzil?.get(`${s}:${a}`) ?? formes.get(`${s}:${a}`)!.join(' ');
  const props = (
    s: number,
    n: number,
    connus: ((s: number, a: number, ws: string[]) => boolean[] | undefined) | null,
  ) => ({
    sura: s,
    verses: Array.from({ length: n }, (_, i) => ({ s, a: i + 1, text: verset(s, i + 1) })),
    basmala: tanzil?.get('1:1') ?? formes.get('1:1')!.join(' '),
    connus,
  });

  it('texte affiché identique avec et sans soulignement, sourate 112 et début de la 2 (basmala d’en-tête)', () => {
    for (const [s, n] of [
      [112, 4],
      [2, 8],
      [1, 7],
    ] as const) {
      const connus = finiN(5);
      const v = sourate(s);
      const sans = render(QuranText, { props: props(s, n, null) }).body;
      const avec = render(QuranText, {
        props: props(s, n, (_s, a, ws) => drapeaux(ws, v[a - 1], connus)),
      }).body;
      expect(sansBalises(avec), `sourate ${s}`).toBe(sansBalises(sans));
      expect(sans).not.toMatch(/class="w[^"]* mc/);
      expect(avec).toMatch(/class="w[^"]* mc/);
      // ce que l'écran montre est le texte de Tanzil (affichage des tanwīns du Muṣḥaf de Médine)
      for (let a = 1; a <= n; a++) {
        const { rest } = splitBasmala(s, a, verset(s, a), props(s, 1, null).basmala);
        const dans = avec.slice(avec.indexOf(`data-verse="${s}:${a}"`));
        const texte = sansBalises(dans.slice(0, dans.indexOf('class="n"'))).replace(/^[^>]*>/, '');
        expect(texte.replace(/\s+/g, ' ').trim()).toContain(
          rest
            .split(' ')
            .map((w) => tanwinDisplay(w))
            .join(' ')
            .slice(0, 12),
        );
      }
    }
  });

  it('les mots soulignés sont exactement les mots reconnus (index data-w)', () => {
    const connus = finiN(2);
    const v = sourate(112);
    const html = render(QuranText, {
      props: props(112, 4, (_s, a, ws) => drapeaux(ws, v[a - 1], connus)),
    }).body;
    const soulignes = [...html.matchAll(/<span class="w[^"]* mc"[^>]*data-w="(\d+)"/g)].length;
    const attendu = v.flat().filter((e) => estReconnu(e, connus)).length;
    expect(soulignes).toBe(attendu);
    expect(attendu).toBeGreaterThan(0);
  });
});

describe('aucune synthèse vocale sur un verset', () => {
  const dossier = fileURLToPath(new URL('.', import.meta.url));
  const api = fileURLToPath(new URL('../../../../api/src/', import.meta.url));
  const fichiers = [
    ...readdirSync(dossier)
      .filter((f) => /\.(ts|svelte|css)$/.test(f) && !f.endsWith('.test.ts'))
      .map((f) => join(dossier, f)),
    join(api, 'coran-mots.ts'),
    join(api, 'coran-mots-recherche.ts'),
    join(fileURLToPath(new URL('../../routes/coran/mots/', import.meta.url)), '+page.svelte'),
  ];
  it('le module n’appelle ni la voix du navigateur, ni les fichiers de synthèse, ni l’audio', () => {
    expect(fichiers.length).toBeGreaterThan(8);
    for (const f of fichiers) {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$|<!--[\s\S]*?-->/gm, '');
      for (const interdit of [
        'speechSynthesis',
        'SpeechSynthesis',
        'Utterance',
        'lecons-audio',
        'leconsAudio',
        'new Audio',
        '<audio',
        'AudioContext',
        'tts',
      ])
        expect(src.includes(interdit), `${f} : ${interdit}`).toBe(false);
    }
  });
});

describe('réglage « souligner les mots que je reconnais »', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('allumé par défaut, gardé sur l’appareil, et sans stockage il reste allumé', async () => {
    const { lireSouligne, ecrireSouligne } = await import('./etat.svelte');
    expect(lireSouligne()).toBe(true);
    ecrireSouligne(false);
    expect(lireSouligne()).toBe(false);
    ecrireSouligne(true);
    expect(lireSouligne()).toBe(true);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('bloqué');
      },
    });
    expect(lireSouligne()).toBe(true);
    expect(() => ecrireSouligne(false)).not.toThrow();
  });
});
