/**
 * Cahier « Je parle » (24/10/2026) : interrupteur `cahier_parler` (coupé par défaut, canal bêta), données de
 * l'application fidèles à la source unique (arabe octet pour octet), étapes et antisèches, clé audio identique à
 * `Get-AudioKey` (moteur des livres), consigne du tuteur sans arabe sur la ligne du français, chargement hors ligne
 * d'abord, progression gardée, chargement à la demande (construction, service worker, budget).
 */
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FONCTIONS,
  etatsAvecDemo,
  fonctionsParDefaut,
  fonctionsPour,
  type ContexteFonction,
} from '@awform/school';
import { audioFileId } from '@awform/content/audio-cle';
import { audioIdFor } from '$lib/lecons-audio';
import { NIVEAUX_PARLER, convertir, partie } from '../../../scripts/cahier-parler-donnees.mjs';
import { PARLER_NIVEAUX } from '../cahier-parler-niveaux';
import {
  chargerParler,
  cleParler,
  decouperConsigne,
  ecrireProgres,
  etapeFranchie,
  etoiles,
  formes,
  lireProgres,
  progresVide,
  type CahierParler,
} from './donnees';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const source = JSON.parse(lire('../../../../../packages/content/data/cahier-parler/ad2.json')) as {
  phrases: Array<{ id: string; ar: string; variations: Record<string, { ar: string }> | null }>;
  conversations: Array<{ id: string; repliques: Array<{ ar: string }>; consigne_tuteur: string }>;
  pages: Array<{ id: string; type: string; refs: string[] | string }>;
};
const habillage = JSON.parse(
  lire('../../../../../packages/content/data/cahier-parler/themes.json'),
);
const app = JSON.parse(lire('../../../static/cahier-data/parler-ad2.json')) as CahierParler;
const AR = /[؀-ۿ]/;
/** pictogrammes dessinés (Picto.svelte) */
const PICTOS = [...lire('./Picto.svelte').matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);

describe('cahier « Je parle » : interrupteur `cahier_parler`', () => {
  const ctx = (canal: 'beta' | 'production'): ContexteFonction => ({
    roles: ['eleve'],
    age: 'adulte',
    pays: 'FR',
    ecoles: [],
    canal,
  });
  it('coupé par défaut partout, démonstration comprise', () => {
    expect(FONCTIONS.cahier_parler).toEqual({ defaut: 'off' });
    expect(fonctionsParDefaut().cahier_parler).toBe(false);
    expect(fonctionsParDefaut('beta').cahier_parler).toBe(false);
    expect(fonctionsPour(ctx('beta'), etatsAvecDemo({}, true), []).cahier_parler).toBe(false);
  });
  it('« canal bêta » depuis l’administration : ouvert aux seuls comptes du canal bêta', () => {
    expect(fonctionsPour(ctx('beta'), { cahier_parler: 'beta' }, []).cahier_parler).toBe(true);
    expect(fonctionsPour(ctx('production'), { cahier_parler: 'beta' }, []).cahier_parler).toBe(
      false,
    );
  });
  it('indépendant du cahier de lecture', () => {
    expect(fonctionsPour(ctx('beta'), { cahier_lecture: 'on' }, []).cahier_parler).toBe(false);
    expect(fonctionsPour(ctx('beta'), { cahier_parler: 'beta' }, []).cahier_lecture).toBe(false);
  });
});

describe('cahier « Je parle » : données de l’application tirées de la source unique', () => {
  it('le fichier de l’application est exactement la conversion de la source (aucune retouche à la main)', () => {
    expect(JSON.parse(JSON.stringify(convertir(source, 'ad2', habillage)))).toEqual(app);
    expect(PARLER_NIVEAUX).toEqual(NIVEAUX_PARLER);
  });
  it('140 phrases, 25 conversations, 5 parties ; arabe octet pour octet', () => {
    expect(Object.keys(app.phrases)).toHaveLength(140);
    expect(Object.keys(app.conversations)).toHaveLength(25);
    expect(app.parties.map((p) => p.n)).toEqual([1, 2, 3, 4, 5]);
    for (const p of source.phrases) {
      const a = app.phrases[p.id]!;
      expect(a.ar).toBe(p.ar);
      if (p.variations?.masculin && p.variations.feminin)
        expect(a.f!.map((f) => f.ar)).toEqual([p.variations.masculin.ar, p.variations.feminin.ar]);
    }
    for (const c of source.conversations)
      expect(app.conversations[c.id]!.r.map((r) => r.ar)).toEqual(c.repliques.map((r) => r.ar));
  });
  it('chaque page de phrases, de conversation, de tuteur, de révision et de bilan a sa place dans une étape', () => {
    const vues = new Set(app.etapes.flatMap((e) => e.pages.map((p) => p.id)));
    const attendues = source.pages
      .filter((p) => !['guide', 'index'].includes(p.type))
      .map((p) => p.id);
    expect([...vues].sort()).toEqual(attendues.sort());
    // toutes les phrases et conversations sont travaillées dans une étape
    const refs = new Set(app.etapes.flatMap((e) => e.pages.flatMap((p) => p.refs)));
    for (const id of [...Object.keys(app.phrases), ...Object.keys(app.conversations)])
      expect(refs.has(id), id).toBe(true);
  });
  it('étapes dans l’ordre des leçons, chacune avec thème, pictogramme d’objet, accroche et phrase du jour', () => {
    const etapes = app.etapes.filter((e) => !e.fin);
    expect(etapes.map((e) => e.num)).toEqual(etapes.map((_, i) => i + 1));
    expect(etapes.map((e) => e.n)).toEqual([...etapes.map((e) => e.n)].sort((a, b) => a - b));
    for (const e of app.etapes) expect(PICTOS, e.id).toContain(e.picto);
    for (const e of etapes) {
      expect(e.titre && e.accroche && e.jour?.ar, e.id).toBeTruthy();
      expect(AR.test(e.accroche!) || AR.test(e.titre!), e.id).toBe(false);
    }
    // une fin par partie (révisions, situation libre, bilan), puis la grille finale
    expect(app.etapes.filter((e) => e.fin).map((e) => e.id)).toEqual([
      'fin1',
      'fin2',
      'fin3',
      'fin4',
      'fin5',
      'finale',
    ]);
    expect(partie('Partie 3 — Librairie, mairie (leçons 11 à 15)')).toEqual({
      n: 3,
      nom: 'Librairie, mairie',
      lecons: 'leçons 11 à 15',
    });
    expect(partie('Clôture')).toBeNull();
  });
  it('antisèche : 6 à 16 lignes, chaque ligne est une phrase ou une réplique du cahier, sans doublon', () => {
    // un même arabe peut avoir deux traductions (« Comment vas-tu ? », « … (à une femme) ») : l'une des siennes
    const textes = new Map<string, Set<string>>();
    const noter = (ar: string, fr: string) => textes.set(ar, (textes.get(ar) ?? new Set()).add(fr));
    for (const p of Object.values(app.phrases)) for (const f of formes(p)) noter(f.ar, f.fr);
    for (const c of Object.values(app.conversations)) for (const r of c.r) noter(r.ar, r.fr);
    for (const e of app.etapes.filter((x) => !x.fin)) {
      const l = e.antiseche!;
      expect(l.length, e.id).toBeGreaterThanOrEqual(6);
      expect(l.length, e.id).toBeLessThanOrEqual(16);
      expect(new Set(l.map(([ar]) => ar)).size).toBe(l.length);
      for (const [ar, fr] of l) expect(textes.get(ar)?.has(fr), ar).toBe(true);
    }
    expect(app.antiseche_ar).toBe(habillage.antiseche_ar);
  });
  it('aucun arabe dans les traductions ni dans les étiquettes « à qui je parle »', () => {
    for (const p of Object.values(app.phrases))
      for (const f of formes(p)) {
        expect(AR.test(f.fr), f.fr).toBe(false);
        expect(AR.test(f.u ?? '')).toBe(false);
      }
  });
});

describe('cahier « Je parle » : clé audio et consigne du tuteur', () => {
  it('la clé du fichier est celle de `Get-AudioKey` (moteur des livres, PowerShell)', () => {
    // valeurs calculées par awform/audio/audio-cle.ps1 (Get-AudioKey, puis SHA-1) le 24/10/2026
    // (textes pris dans les données : P01, forme pour une femme de P03, 1re réplique de C03, « اسْمِي … »)
    const nom = Object.values(app.phrases).find((p) => p.ar.endsWith('…'))!.ar;
    const ps: Array<[string, string]> = [
      [app.phrases.P01!.ar, '438187d99b0e6d0d10ca9303f383827164325d44'],
      [app.phrases.P03!.f![1]!.ar, '9eb14bb714332b2b13fa56c5acc689cb9be8ffa9'],
      [app.conversations.C03!.r[0]!.ar, '80998ad3fbc4b41eca402b75c0d17a3bcb0807d3'],
      [nom, '65387fc7becab74301977968ec0be38ec1887bd1'],
    ];
    for (const [ar, sha] of ps) expect(audioFileId(ar), ar).toBe(sha);
  });
  it('une phrase ne se joue que si son fichier est dans l’index audio du niveau', () => {
    const ar = app.phrases.P01!.ar;
    const la = {
      niveau: 'ad2',
      fichiers: new Set([audioFileId(ar)!]),
      octets: 0,
      mention: '',
      credits: [],
    };
    expect(audioIdFor(ar, la)).toBe(audioFileId(ar));
    expect(audioIdFor(app.phrases.P02!.ar, la)).toBeNull();
    expect(audioIdFor(ar, null)).toBeNull();
  });
  it('consigne : chaque forme arabe quitte la ligne du français (marqueur ①, ②…), recopiée telle quelle', () => {
    const d = decouperConsigne(
      'Le tuteur te montre des bâtiments. Demande « مَا ذٰلِكَ؟ » ou « هَلْ هٰذِهِ…؟ », puis propose d’aller prier.',
    );
    expect(d.fr).toBe(
      'Le tuteur te montre des bâtiments. Demande ① ou ②, puis propose d’aller prier.',
    );
    expect(d.ar).toEqual([
      { m: '①', ar: 'مَا ذٰلِكَ؟' },
      { m: '②', ar: 'هَلْ هٰذِهِ…؟' },
    ]);
    expect(decouperConsigne('Réponds pour le groupe (نَحْنُ).').fr).toBe(
      'Réponds pour le groupe ①.',
    );
    for (const c of Object.values(app.conversations)) {
      const x = decouperConsigne(c.consigne);
      expect(AR.test(x.fr), c.consigne).toBe(false);
      for (const a of x.ar) expect(c.consigne).toContain(a.ar);
    }
  });
});

describe('cahier « Je parle » : appareil et chargement à la demande', () => {
  it('hors ligne d’abord : le cahier est gardé à la première ouverture, puis lu sur l’appareil', async () => {
    let appels = 0;
    const reseau = (async () => {
      appels++;
      return new Response(JSON.stringify(app), { status: 200 });
    }) as typeof fetch;
    const c = await chargerParler('ad2-essai', undefined, reseau);
    expect(c?.etapes.length).toBe(app.etapes.length);
    const coupe = (async () => {
      throw new Error('hors ligne');
    }) as typeof fetch;
    const d = await chargerParler('ad2-essai', undefined, coupe);
    expect(d?.version).toBe(app.version);
    expect(appels).toBe(1);
    expect(cleParler('ad2')).toBe('cahier-data:parler-ad2');
    // réponse invalide : rien n'est gardé
    const faux = (async () => new Response('{"format":2}', { status: 200 })) as typeof fetch;
    expect(await chargerParler('ad2-faux', undefined, faux)).toBeNull();
  });
  it('6 cases et bilans gardés par profil ; étape franchie ; une étoile par thème réussi', async () => {
    const e = app.etapes.find((x) => x.id === 'e03')!;
    const p = progresVide();
    expect(etapeFranchie(e, p)).toBe(false);
    for (const pg of e.pages.filter((x) => x.type === 'cartes'))
      p.cases[pg.id] = Array(6).fill(true);
    expect(etapeFranchie(e, p)).toBe(true);
    const bilan = app.etapes.find((x) => x.id === 'fin1')!.pages.find((x) => x.type === 'bilan')!;
    for (const r of bilan.refs) (p.bilans[bilan.id] ??= {})[r] = 'oui';
    expect(etoiles(app, bilan, p).every((x) => x.reussi)).toBe(true);
    p.bilans[bilan.id]![bilan.refs[0]!] = 'presque';
    expect(etoiles(app, bilan, p).filter((x) => !x.reussi)).toHaveLength(1);
    await ecrireProgres('ad2', 'profil-1', p);
    expect((await lireProgres('ad2', 'profil-1')).bilans[bilan.id]![bilan.refs[0]!]).toBe(
      'presque',
    );
    expect(await lireProgres('ad2', 'profil-2')).toEqual(progresVide());
  });
  it('textes français tutoyés, sans arabe', () => {
    const fr = JSON.parse(lire('./textes-fr.json')) as Record<string, string>;
    expect(Object.keys(fr).length).toBeGreaterThan(50);
    expect(Object.entries(fr).filter(([, v]) => /\b(vous|votre|vos)\b/i.test(v))).toEqual([]);
    expect(Object.entries(fr).filter(([, v]) => AR.test(v))).toEqual([]);
  });
  it('code du cahier hors de la coquille : liste /_app/parler.json, service worker, garde de poids', () => {
    expect(lire('../../../vite.config.ts')).toMatch(/aLaDemande\('parler'/);
    const sw = lire('../../service-worker.ts');
    expect(sw).toContain("'/_app/parler.json'");
    // données dans /cahier-data/ : jamais préchargées
    expect(sw).toMatch(/!isCahier\(f\)/);
    const budget = lire('../../../scripts/budget.mjs');
    expect(budget).toMatch(/BUDGET_PARLER/);
    expect(budget).toMatch(/cahier « Je parle » \(à la demande\)/);
  });
});
