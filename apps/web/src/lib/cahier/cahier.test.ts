/**
 * Cahier de lecture (20/10/2026) : interrupteur `cahier_lecture`, données de l'application fidèles à la source unique
 * (arabe octet pour octet, chadda puis voyelle), Coran jamais en synthèse, concordance avec les leçons, lecture guidée
 * (pause de 1,5 fois la durée), bilans à froid et rattrapage, minutes, atelier, progression gardée, textes tutoyés,
 * chargement à la demande (construction, service worker, budget).
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
import { audioFileId, looksQuranic } from '@awform/content/audio-cle';
import { concordance, convertir } from '../../../scripts/cahier-donnees.mjs';
import { CAHIER_NIVEAUX, CAHIER_UNITES } from '../cahier-pages';
import { ecrireProgres, idPage, lireProgres, pageDuJour, pageFaite, progresVide } from './progres';
import {
  elementsDeLaPage,
  estAtelier,
  leconAtteinte,
  ligneTexte,
  type AtelierMot,
  type Cahier,
  type El,
} from './donnees';
import { FACTEUR_PAUSE, SANS_AUDIO_MS, lectureGuidee, refVerset, type Pas } from './lecture';
import {
  SIGNES,
  atelierJuste,
  caseVoisine,
  choixInitiaux,
  lettreComposee,
  motsDuBilan,
  parMinute,
  premiereCase,
  resultatBilan,
} from './outils';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const source = JSON.parse(lire('../../../../../packages/content/data/cahier/ad1.json'));
const audioSource = JSON.parse(
  lire('../../../../../packages/content/data/cahier/ad1.audio.json'),
) as {
  garde_coran: string[];
};
const app = JSON.parse(lire('../../../static/cahier-data/ad1.json')) as Cahier;
const AR = /[؀-ۿ]/;
const CHADDA = String.fromCharCode(0x651);
const FATHA = String.fromCharCode(0x64e);
/** voyelle (fatḥa à kasra, tanwīn compris) écrite AVANT la chadda : ordre interdit par le cahier */
const voyelleAvantChadda = (s: string) =>
  [...s].some(
    (c, i, a) => c.charCodeAt(0) >= 0x64b && c.charCodeAt(0) <= 0x650 && a[i + 1] === CHADDA,
  );

/** toutes les chaînes d'un objet JSON */
function chaines(o: unknown, out: string[] = []): string[] {
  if (typeof o === 'string') out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => chaines(x, out));
  else if (o && typeof o === 'object') Object.values(o).forEach((x) => chaines(x, out));
  return out;
}
const tousLesElements = (c: Cahier): El[] =>
  c.pages.flatMap((p) => elementsDeLaPage(p).map((x) => x.el));

describe('cahier de lecture : interrupteur « cahier_lecture »', () => {
  const ctx: ContexteFonction = {
    roles: ['eleve'],
    age: 'adulte',
    pays: 'FR',
    ecoles: [],
    canal: 'beta',
  };
  it('coupé en production et en bêta, allumé sur la démonstration, réglable par l’administrateur', () => {
    expect(FONCTIONS.cahier_lecture).toEqual({ defaut: 'off', demo: 'on' });
    expect(fonctionsParDefaut().cahier_lecture).toBe(false);
    expect(fonctionsParDefaut('beta').cahier_lecture).toBe(false);
    expect(fonctionsPour(ctx, etatsAvecDemo({}, false), []).cahier_lecture).toBe(false);
    expect(fonctionsPour(ctx, etatsAvecDemo({}, true), []).cahier_lecture).toBe(true);
    expect(
      fonctionsPour(ctx, etatsAvecDemo({ cahier_lecture: 'off' }, true), []).cahier_lecture,
    ).toBe(false);
    expect(
      fonctionsPour(ctx, {}, [{ cle: 'cahier_lecture', effet: 'on', pays: 'FR' }]).cahier_lecture,
    ).toBe(true);
  });
  it('indépendant des vidéos vivantes et de la refonte', () => {
    const v = fonctionsPour(ctx, { video_vivante: 'on', design_v4: 'on' }, []);
    expect(v.cahier_lecture).toBe(false);
  });
});

describe('cahier de lecture : données de l’application tirées de la source unique', () => {
  it('le fichier de l’application est exactement la conversion de la source (aucune retouche à la main)', () => {
    expect(JSON.parse(JSON.stringify(convertir(source, 'ad1', audioSource.garde_coran)))).toEqual(
      app,
    );
    expect(app.pages).toHaveLength(source.pages.length);
    expect(CAHIER_NIVEAUX).toEqual(['ad1']);
  });
  it('arabe octet pour octet : chaque texte arabe affiché existe tel quel dans la source', () => {
    const src = new Set(chaines(source));
    const absents = chaines(app).filter((s) => AR.test(s) && !src.has(s));
    expect(absents).toEqual([]);
    // aucune normalisation : la chadda précède la voyelle, comme dans la source (une normalisation l'inverserait)
    const ar = chaines(app).filter((s) => AR.test(s));
    expect(ar.some((s) => s.includes(CHADDA + FATHA))).toBe(true);
  });
  it('chadda puis voyelle, aucune phonétique latine dans l’arabe', () => {
    const els = tousLesElements(app).filter((e) => e.a !== 'q');
    expect(els.length).toBeGreaterThan(3000);
    expect(els.filter((e) => voyelleAvantChadda(e.ar)).map((e) => e.ar)).toEqual([]);
    expect(els.filter((e) => /[A-Za-z]/.test(e.ar)).map((e) => e.ar)).toEqual([]);
  });
  it('Coran : muṣḥaf, lettres isolées et sourates en RÉCITATION seulement, jamais en synthèse', () => {
    const els = tousLesElements(app);
    // graphie du muṣḥaf : alif waṣla (U+0671) ou petits signes (U+06D6 à U+06ED)
    const mushaf = els.filter((e) =>
      [...e.ar].some((c) => {
        const x = c.charCodeAt(0);
        return x === 0x671 || (x >= 0x6d6 && x <= 0x6ed);
      }),
    );
    expect(mushaf.length).toBeGreaterThan(80);
    expect(mushaf.filter((e) => e.a !== 'q')).toEqual([]);
    for (const p of app.pages)
      for (const b of p.blocs)
        if (b.type === 'sourate' || b.type === 'mots_mushaf')
          for (const e of b.el as El[]) {
            expect(e.a, `${p.id} ${e.ar}`).toBe('q');
            expect(refVerset(e.ref), `${p.id} ${e.ar}`).not.toBeNull();
          }
    // la Basmala citée en tête d'une lettre (texte suivi) cite le Coran : récitée (1:1), jamais synthétisée
    expect(audioSource.garde_coran).toHaveLength(1);
    const lignes = app.pages.flatMap((p) =>
      p.texte ? p.texte.lignes.map((_, i) => ligneTexte(p.texte!, i)) : [],
    );
    const citees = lignes.filter((l) => l.a === 'q');
    expect(citees).toHaveLength(1);
    expect(citees[0]!.ref).toBe('1:1');
    // et la garde de l'application écarte ces textes des fichiers de synthèse, même si un fichier existait
    for (const e of mushaf.slice(0, 40)) expect(looksQuranic(e.ar), e.ar).toBe(true);
    expect(audioFileId('بَ')).toMatch(/^[0-9a-f]{40}$/);
  });
  it('concordance : pages du parcours par leçon d’Adultes 1 (rattrapage hors parcours)', () => {
    const c = concordance(source, 'ad1');
    expect(CAHIER_UNITES).toEqual(Object.keys(c).filter((u) => u !== 'ad1.l00'));
    expect(CAHIER_UNITES.every((k) => /^ad1\.l\d\d$/.test(k))).toBe(true);
    expect(c['ad1.l01']).toEqual([4]);
    const hors = app.pages.filter((p) => p.hors).map((p) => p.num);
    expect(hors).toHaveLength(11);
    expect(
      Object.values(c)
        .flat()
        .filter((n) => hors.includes(n)),
    ).toEqual([]);
    // chaque page du parcours se lit après une leçon du livre (ou avant la leçon 1)
    for (const p of app.pages.filter((x) => !x.hors))
      expect(p.n === 0 || CAHIER_UNITES.includes(`ad1.${p.apres}`), p.id).toBe(true);
  });
  it('bilans : chaque mot porte sa difficulté, et sa page de rattrapage existe', () => {
    const bilans = app.pages.filter((p) => p.type === 'bilan');
    expect(bilans).toHaveLength(11);
    const ids = new Set(app.pages.map((p) => p.id));
    for (const p of bilans) {
      expect(p.critere?.seuil, p.id).toBeGreaterThan(0);
      for (const m of motsDuBilan(p)) if (m.r) expect(ids.has(m.r), `${p.id} ${m.r}`).toBe(true);
    }
  });
});

describe('cahier de lecture : lecture guidée (la case s’allume au rythme de la voix)', () => {
  const fauxPas = (durees: Array<number | null>): Pas[] =>
    durees.map((d, i) => ({ cle: `k${i}`, jouer: async () => d }));
  it('chaque case s’allume, son fichier joue, puis une pause de 1,5 fois sa durée', async () => {
    const vus: number[] = [];
    const attentes: number[] = [];
    const ok = await lectureGuidee(fauxPas([400, null, 1000]), {
      signal: new AbortController().signal,
      surPas: (i) => vus.push(i),
      attendre: async (ms) => {
        attentes.push(ms);
      },
    });
    expect(ok).toBe(true);
    expect(vus).toEqual([0, 1, 2, -1]);
    expect(FACTEUR_PAUSE).toBe(1.5);
    expect(attentes).toEqual([600, SANS_AUDIO_MS, 1500]);
  });
  it('s’arrête à la demande', async () => {
    const ctrl = new AbortController();
    const vus: number[] = [];
    const ok = await lectureGuidee(fauxPas([100, 100, 100]), {
      signal: ctrl.signal,
      surPas: (i) => {
        vus.push(i);
        if (i === 1) ctrl.abort();
      },
      attendre: async (_ms, s) => {
        if (s.aborted) throw new Error('arret');
      },
    });
    expect(ok).toBe(false);
    expect(vus).toEqual([0, 1]);
  });
  it('ordre de lecture d’une grille : 5 rangées de 3 cases, puis la ligne de mots', () => {
    const g = app.pages.find((p) => p.type === 'grille')!;
    const cles = elementsDeLaPage(g).map((x) => x.cle);
    expect(cles.slice(0, 15)).toEqual(
      [0, 1, 2, 3, 4].flatMap((r) => [0, 1, 2].map((c) => `0.${r}.${c}`)),
    );
    expect(cles.length).toBeGreaterThan(20);
  });
  it('texte suivi : le titre, puis chaque ligne ; sourate : la Basmala, puis chaque verset', () => {
    const tx = app.pages.find((p) => p.type === 'texte')!;
    const e = elementsDeLaPage(tx);
    expect(e.slice(0, 2).map((x) => x.cle)).toEqual(['t.t', 't.0']);
    const so = app.pages.find((p) => p.blocs.some((b) => b.basmala))!;
    const es = elementsDeLaPage(so);
    expect(es[0]!.el.a).toBe('q');
    expect(es.every((x) => x.el.a === 'q')).toBe(true);
  });
});

describe('cahier de lecture : bilans, minutes, atelier', () => {
  const bilan = app.pages.find((p) => p.type === 'bilan')!;
  const mots = motsDuBilan(bilan);
  it('bilan à froid : 90 % du premier coup, et renvoi aux pages de rattrapage des mots manqués', () => {
    expect(resultatBilan(mots, [], bilan.critere?.seuil).reussi).toBe(true);
    const deux = resultatBilan(mots, [0, 1], bilan.critere?.seuil);
    expect(deux.justes).toBe(mots.length - 2);
    expect(deux.reussi).toBe(mots.length - 2 >= bilan.critere!.seuil);
    const avecRenvoi = mots.findIndex((m) => m.r);
    const r = resultatBilan(mots, [avecRenvoi, avecRenvoi], bilan.critere?.seuil);
    expect(r.justes).toBe(mots.length - 1);
    expect(r.rattrapages[0]!.page).toBe(mots[avecRenvoi]!.r);
    expect(r.rattrapages[0]!.mots).toEqual([mots[avecRenvoi]!.ar]);
  });
  it('minute de lecture : éléments justes par minute', () => {
    expect(parMinute(42, 60)).toBe(42);
    expect(parMinute(59, 90)).toBe(39);
    expect(parMinute(10, 0)).toBe(0);
  });
  it('atelier : 7 signes (touches 1 à 7), lettres fixes sautées, validation', () => {
    expect(SIGNES.map((s) => s.k)).toEqual([
      'fatha',
      'kasra',
      'damma',
      'soukoun',
      'shadda+fatha',
      'shadda+kasra',
      'shadda+damma',
    ]);
    const ateliers = app.pages.flatMap((p) =>
      p.blocs.filter((b) => b.type === 'atelier_mot').flatMap((b) => b.el.filter(estAtelier)),
    ) as AtelierMot[];
    expect(ateliers.length).toBeGreaterThanOrEqual(50);
    for (const m of ateliers) {
      const juste = m.cases.map((x) => x.signe);
      expect(atelierJuste(m, juste)).toBe(true);
      expect(atelierJuste(m, choixInitiaux(m))).toBe(!m.cases.some((x) => x.choix));
      // le mot composé avec la solution redonne exactement la solution du cahier
      expect(m.cases.map((_, i) => lettreComposee(m, i, juste)).join('')).toBe(
        m.cases.map((x) => x.lettre + (SIGNES.find((s) => s.k === x.signe)?.m ?? '')).join(''),
      );
    }
    const avecFixe = ateliers.find((m) => m.cases.some((x) => !x.choix));
    if (avecFixe) {
      const i = avecFixe.cases.findIndex((x) => !x.choix);
      expect(caseVoisine(avecFixe, i - 1, 1)).not.toBe(i);
    }
    expect(premiereCase(ateliers[0]!)).toBe(0);
  });
});

describe('cahier de lecture : progression gardée sur l’appareil', () => {
  it('6 cases mémorisées par profil, page faite, page du jour', async () => {
    const p = progresVide();
    expect(pageDuJour([8, 19], p)).toBe(8);
    p.pages[idPage(8)] = { cases: [true, true, true, true, true, true] };
    expect(pageFaite(p, 'P008')).toBe(true);
    expect(pageDuJour([8, 19], p)).toBe(19);
    await ecrireProgres('ad1', 'profil-1', p);
    expect((await lireProgres('ad1', 'profil-1')).pages.P008!.cases.filter(Boolean)).toHaveLength(
      6,
    );
    expect((await lireProgres('ad1', 'profil-2')).pages).toEqual({});
  });
  it('leçon atteinte : la plus avancée des unités terminées', () => {
    expect(leconAtteinte(null)).toBeNull();
    expect(
      leconAtteinte({ 'ad1.l03': 'terminee', 'ad1.l05': 'maitrisee', 'ad1.l06': 'en_cours' }),
    ).toBe(5);
  });
});

describe('cahier de lecture : textes et chargement à la demande', () => {
  it('textes français tutoyés, sans phonétique latine de l’arabe', () => {
    const fr = { ...JSON.parse(lire('./textes-fr.json')) } as Record<string, string>;
    const arabe = JSON.parse(lire('../../../static/i18n/fr-arabe.json')) as Record<string, string>;
    for (const k of Object.keys(arabe)) if (k.startsWith('cahier.')) fr[k] = arabe[k]!;
    expect(Object.keys(fr).length).toBeGreaterThan(70);
    expect(Object.entries(fr).filter(([, v]) => /\b(vous|votre|vos)\b/i.test(v))).toEqual([]);
  });
  it('code du cahier hors de la coquille : liste /_app/cahier.json, service worker, garde de poids', () => {
    expect(lire('../../../vite.config.ts')).toMatch(/aLaDemande\(\s*'cahier'/);
    const sw = lire('../../service-worker.ts');
    expect(sw).toContain("'/_app/cahier.json'");
    expect(sw).toMatch(/!isCahier\(f\)/);
    const budget = lire('../../../scripts/budget.mjs');
    expect(budget).toMatch(/BUDGET_CAHIER/);
    expect(budget).toMatch(/cahier \(à la demande\)/);
  });
});
