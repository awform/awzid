import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TAJWID_RULES, textHash } from '@awform/content/tajwid';
import { FONCTIONS } from '@awform/school';
import textes from './textes-fr.json';
import { ciblesDe, demanderMadd } from './cibles';

/** Indication des madd (25/10/2026, interrupteur `tajwid_madd`) : cibles tirées des annotations, sortie bornée, règles du projet. */
const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const R = (r: string) => TAJWID_RULES.indexOf(r as (typeof TAJWID_RULES)[number]);

// texte d'ESSAI (pas un verset) : quatre mots
const TEXTE = 'قَالَ جَاءَ ضَالِّينَ بَابٌ';
const debut = (mot: string) => TEXTE.indexOf(mot);
const entree = (...anns: Array<[string, string]>): [string, ...number[]] => [
  textHash(TEXTE),
  ...anns.flatMap(([r, mot]) => [R(r), debut(mot), mot.length]),
];

describe('cibles : les madd longs d’un verset, d’après les annotations', () => {
  it('muttaṣil et lāzim sont proposés ; les autres madd comptent dans n mais ne sont jamais proposés', () => {
    const e = entree(
      ['madd_2', 'قَالَ'],
      ['madd_muttasil', 'جَاءَ'],
      ['madd_6', 'ضَالِّينَ'],
      ['madd_munfasil', 'بَابٌ'],
    );
    const c = ciblesDe(TEXTE, e)!;
    expect(c.n).toBe(4);
    expect(c.cibles).toEqual([
      { k: 1, type: 'muttasil', mot: 'جَاءَ' },
      { k: 2, type: 'lazim', mot: 'ضَالِّينَ' },
    ]);
  });
  it('aucun madd long : rien n’est proposé (le composant ne s’affiche pas)', () => {
    expect(ciblesDe(TEXTE, entree(['madd_2', 'قَالَ'], ['madd_246', 'بَابٌ']))).toBeNull();
    expect(ciblesDe(TEXTE, entree(['ghunnah', 'قَالَ']))).toBeNull();
  });
  it('annotation qui ne correspond pas exactement au texte : rien (jamais de cible devinée)', () => {
    expect(ciblesDe(`${TEXTE}ا`, entree(['madd_muttasil', 'جَاءَ']))).toBeNull();
    expect(ciblesDe(TEXTE, undefined)).toBeNull();
  });
});

describe('demande au serveur : une indication ou rien', () => {
  afterEach(() => vi.unstubAllGlobals());
  const cible = { k: 1, type: 'muttasil' as const, mot: 'جَاءَ' };
  const audio = new Blob([new Uint8Array(10)], { type: 'audio/webm;codecs=opus' });
  const faux = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it('« trop_court » est la seule valeur transmise ; le reste devient « rien »', async () => {
    for (const [recu, attendu] of [
      ['trop_court', 'trop_court'],
      [null, null],
      ['correct', null],
      [0.9, null],
    ] as const) {
      vi.stubGlobal('fetch', faux(200, { indication: recu }));
      expect(await demanderMadd('p1', { s: 112, a: 2 }, cible, 3, audio)).toEqual({
        ok: true,
        indication: attendu,
      });
    }
  });
  it('envoie k, type, n et le verset ; l’audio sans paramètre de codec', async () => {
    const f = faux(200, { indication: null });
    vi.stubGlobal('fetch', f);
    await demanderMadd('p1', { s: 112, a: 2 }, cible, 3, audio);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/profiles/p1/tajwid/madd?s=112&a=2&k=1&type=muttasil&n=3');
    expect((init.headers as Record<string, string>)['content-type']).toBe('audio/webm');
    expect(init.method).toBe('POST');
  });
  it('erreurs : le code du serveur, ou « reseau »', async () => {
    vi.stubGlobal('fetch', faux(409, { error: { code: 'accord_requis' } }));
    expect(await demanderMadd('p1', { s: 1, a: 2 }, cible, 1, audio)).toEqual({
      ok: false,
      code: 'accord_requis',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('hors ligne'))),
    );
    expect(await demanderMadd('p1', { s: 1, a: 2 }, cible, 1, audio)).toEqual({
      ok: false,
      code: 'reseau',
    });
  });
});

describe('indication des madd : règles du projet', () => {
  const composant = lire('./Madd.svelte');
  const logique = lire('./cibles.ts');
  const panneau = lire('../ecoute/PanneauEcoute.svelte');

  it('coupé par défaut ; le panneau ne propose l’indication qu’aux ADULTES, pour UN verset, interrupteur ouvert', () => {
    expect(FONCTIONS.tajwid_madd.defaut).toBe('off');
    const hook = panneau.slice(panneau.indexOf("fn('tajwid_madd')"), panneau.indexOf('m.Madd'));
    expect(hook).toContain("kind === 'adulte'");
    expect(hook).toContain('!enfant');
    expect(hook).toContain('portion.from === portion.to');
    // chargée à la demande : jamais importée en haut du panneau
    expect(panneau.split('\n').filter((l) => /^\s*import .*Madd/.test(l))).toEqual([]);
  });
  it('la phrase de prudence est exacte et affichée', () => {
    expect(textes['md.notice']).toBe(
      'Indication automatique, en cours de validation par des maîtres. Ton maître reste la référence.',
    );
    expect(composant).toContain("t('md.notice')");
  });
  it('jamais « correct », jamais de note, de pourcentage ni de chiffre dans ce que voit l’élève', () => {
    const vus = Object.entries(textes)
      .filter(([k]) => k !== 'md.notice')
      .map(([, v]) => v)
      .join('\n');
    expect(vus).not.toMatch(/correct|bravo|parfait|réussi|valide ta|\d\s?%|\/\s?20|note :/i);
    // « Ce n’est pas une validation » est la seule mention de la validation
    expect(textes['md.rien']).toContain('Ce n’est pas une validation');
    expect(composant + logique).not.toMatch(/score|pourcent|rapport|duree|durée/i);
  });
  it('rien n’est gardé ni synthétisé : pas de stockage, pas de voix de synthèse', () => {
    expect(composant + logique).not.toMatch(
      /speechSynthesis|SpeechSynthesisUtterance|saveRecording|localStorage|sessionStorage|kvSet|indexedDB/,
    );
    // l'enregistrement du panneau est transmis tel quel, sans copie
    expect(logique).toMatch(/body: audio/);
  });
  it('le mot du verset reste en texte Tanzil, isolé en arabe, sans <Bidi>', () => {
    expect(composant).toMatch(/class="mot quran-text" lang="ar" dir="rtl"/);
    expect(composant).not.toMatch(/<Bidi[^>]*c\.mot/);
  });
});
