import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONCTIONS } from '@awform/school';
import textes from './textes-fr.json';
import {
  ajouterJours,
  apresPartDuJour,
  avancementDepuisPage,
  calculer,
  joursPourRythme,
  juzDePage,
  juzDePart,
  pagesPourDuree,
  type PartVue,
  type PlanVue,
} from './plan';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const DEBUT = '2026-11-01';
const plan = (o: Partial<PlanVue> = {}): PlanVue => ({
  kind: 'khatma',
  scope: 'profil',
  mode: 'duree',
  startDate: DEBUT,
  endDate: ajouterJours(DEBUT, 29), // 30 jours
  pagesPerDay: null,
  status: 'active',
  ...o,
});
const part = (o: Partial<PartVue> = {}): PartVue => ({
  firstPage: 1,
  lastPage: 604,
  done: 0,
  doneDayStart: 0,
  dayMark: null,
  ...o,
});

describe('khatma : part du jour recalculée, sans reproche', () => {
  it('premier jour d’une khatma en 30 jours : 21 pages, pages 1 à 21', () => {
    const c = calculer(plan(), part(), DEBUT);
    expect(c.partDuJour).toBe(21);
    expect(c.pagesDuJour).toEqual([1, 21]);
    expect(c.joursRestants).toBe(30);
    expect(c.rythme).toBe('rythme');
    expect(c.jourLu).toBe(false);
    expect(c.finDepassee).toBe(false);
  });

  it('la part du jour ne rétrécit pas pendant qu’on lit (point de départ du jour fixé)', () => {
    const matin = calculer(plan(), part({ done: 0, dayMark: DEBUT, doneDayStart: 0 }), DEBUT);
    const apres = calculer(plan(), part({ done: 10, dayMark: DEBUT, doneDayStart: 0 }), DEBUT);
    expect(apres.partDuJour).toBe(matin.partDuJour);
    expect(apres.luAujourdhui).toBe(10);
    expect(apres.jourLu).toBe(false);
    const fini = calculer(plan(), part({ done: 21, dayMark: DEBUT, doneDayStart: 0 }), DEBUT);
    expect(fini.jourLu).toBe(true);
  });

  it('de l’avance : la part du lendemain s’allège', () => {
    const j2 = ajouterJours(DEBUT, 1);
    // 60 pages lues le premier jour au lieu de 21
    const c = calculer(plan(), part({ done: 60, dayMark: DEBUT, doneDayStart: 0 }), j2);
    expect(c.debutJour).toBe(60);
    expect(c.partDuJour).toBe(Math.ceil((604 - 60) / 29));
    expect(c.partDuJour).toBeLessThan(21);
    expect(c.rythme).toBe('avance');
  });

  it('du retard : la part se répartit sur les jours qui restent, sans dette ni reproche', () => {
    const j11 = ajouterJours(DEBUT, 10);
    const c = calculer(plan(), part({ done: 0 }), j11);
    expect(c.joursRestants).toBe(20);
    expect(c.partDuJour).toBe(Math.ceil(604 / 20));
    expect(c.rythme).toBe('souple');
    expect(c.finDepassee).toBe(false);
  });

  it('date de fin passée : on propose de la repousser et on garde le rythme d’origine (jamais une dette)', () => {
    const apres = ajouterJours(DEBUT, 40);
    const c = calculer(plan(), part({ done: 200 }), apres);
    expect(c.finDepassee).toBe(true);
    expect(c.joursRestants).toBe(0);
    expect(c.partDuJour).toBe(21);
    expect(c.finProposee).toBe(ajouterJours(apres, Math.ceil(404 / 21) - 1));
  });

  it('khatma terminée : plus de part du jour', () => {
    const c = calculer(plan(), part({ done: 604 }), DEBUT);
    expect(c.termine).toBe(true);
    expect(c.partDuJour).toBe(0);
    expect(c.pagesDuJour).toBeNull();
    expect(c.pageCourante).toBeNull();
    expect(c.jourLu).toBe(true);
  });

  it('plan par pages : la part est fixe, la fin prévue se déplace avec l’avancement', () => {
    const p = plan({ mode: 'pages', endDate: null, pagesPerDay: 4 });
    const a = calculer(p, part(), DEBUT);
    expect(a.partDuJour).toBe(4);
    expect(a.finPrevue).toBe(ajouterJours(DEBUT, Math.ceil(604 / 4) - 1));
    const b = calculer(p, part({ done: 100, dayMark: DEBUT, doneDayStart: 100 }), DEBUT);
    expect(b.finPrevue).toBe(ajouterJours(DEBUT, Math.ceil(504 / 4) - 1));
    expect(joursPourRythme(4)).toBe(151);
    expect(pagesPourDuree(30)).toBe(21);
  });

  it('wird : des pages chaque jour, sans fin, les tours se cumulent et la page revient au début', () => {
    const p = plan({ kind: 'wird', mode: 'wird', endDate: null, pagesPerDay: 5 });
    const c = calculer(p, part({ done: 1300, dayMark: DEBUT, doneDayStart: 1295 }), DEBUT);
    expect(c.tours).toBe(2);
    expect(c.partDuJour).toBe(5);
    expect(c.luAujourdhui).toBe(5);
    expect(c.jourLu).toBe(true);
    expect(c.pageCourante).toBe(1 + (1300 % 604));
    expect(c.termine).toBe(false);
    expect(c.finPrevue).toBeNull();
    // fin de tour : les pages du jour restent dans la part
    const f = calculer(p, part({ done: 602, dayMark: '2026-10-01', doneDayStart: 600 }), DEBUT);
    expect(f.pagesDuJour).toEqual([603, 604]);
  });

  it('part d’un groupe (juzʾ 3 : pages 42 à 61) : calcul sur la taille de la part, fin commune', () => {
    const p = plan({ scope: 'famille' });
    const c = calculer(p, part({ firstPage: 42, lastPage: 61 }), DEBUT);
    expect(c.taille).toBe(20);
    expect(c.partDuJour).toBe(1);
    expect(c.pagesDuJour).toEqual([42, 42]);
    const fin = calculer(p, part({ firstPage: 42, lastPage: 61, done: 20 }), DEBUT);
    expect(fin.termine).toBe(true);
  });

  it('avancement : « J’ai lu ma part du jour » ne recule jamais et ne dépasse pas la part', () => {
    const p = plan();
    const pt = part({ done: 30, dayMark: DEBUT, doneDayStart: 20 });
    const c = calculer(p, pt, DEBUT);
    expect(apresPartDuJour(p, pt, c)).toBe(Math.max(30, 20 + c.partDuJour));
    const presque = part({ done: 600, dayMark: DEBUT, doneDayStart: 598 });
    expect(apresPartDuJour(p, presque, calculer(p, presque, DEBUT))).toBeLessThanOrEqual(604);
    // « j’en suis à la page 120 » : 119 pages lues
    expect(avancementDepuisPage(p, pt, 120, c)).toBe(119);
    const w = plan({ kind: 'wird', mode: 'wird', endDate: null, pagesPerDay: 2 });
    const cw = calculer(w, part({ done: 700 }), DEBUT);
    expect(avancementDepuisPage(w, part(), 10, cw)).toBe(604 + 9);
  });
});

describe('khatma : juzʾ et parts', () => {
  it('juzʾ d’une page du Muṣḥaf de Médine', () => {
    expect(juzDePage(1)).toBe(1);
    expect(juzDePage(21)).toBe(1);
    expect(juzDePage(22)).toBe(2);
    expect(juzDePage(41)).toBe(2);
    expect(juzDePage(42)).toBe(3);
    expect(juzDePage(582)).toBe(30);
    expect(juzDePage(604)).toBe(30);
  });
  it('une part de juzʾ entiers se dit en juzʾ, sinon en pages', () => {
    expect(juzDePart(1, 21)).toEqual([1, 1]);
    expect(juzDePart(22, 61)).toEqual([2, 3]);
    expect(juzDePart(582, 604)).toEqual([30, 30]);
    expect(juzDePart(1, 604)).toEqual([1, 30]);
    expect(juzDePart(10, 40)).toBeNull();
    expect(juzDePart(22, 60)).toBeNull();
  });
});

describe('khatma : textes et mise en place', () => {
  const tous = Object.entries(textes as Record<string, string>);

  it('aucun mot de reproche, de dette, de série ni de retard dans les textes', () => {
    for (const [k, v] of tous)
      expect(v, k).not.toMatch(
        /retard|raté|rate\b|échec|série|perdu|dette|manqué|paresse|honte|en panne/i,
      );
  });

  it('aucun texte arabe sur la ligne du français (les termes sont translittérés)', () => {
    for (const [k, v] of tous) expect(v, k).not.toMatch(/[؀-ۿ]/);
  });

  it('jamais de classement ni de rang pour les participants', () => {
    const src = [
      './Carte.svelte',
      './Creation.svelte',
      './Reglages.svelte',
      './donnees.ts',
      './plan.ts',
    ]
      .map(lire)
      .join('\n');
    expect(src).not.toMatch(/classement\s*:|\brang\b|leaderboard|ranking|podium/i);
    // l’unique mention du mot est la promesse « Aucun classement »
    expect(textes['kh.sans_classement']).toMatch(/Aucun classement/);
  });

  it('aucune synthèse vocale ni audio dans le module (le texte du Coran n’est pas touché)', () => {
    const src = [
      './Carte.svelte',
      './Creation.svelte',
      './Reglages.svelte',
      './donnees.ts',
      './plan.ts',
    ]
      .map(lire)
      .join('\n');
    expect(src).not.toMatch(/speechSynthesis|SpeechSynthesis|tts|\bAudio\(|<audio/i);
  });

  it('coupée par défaut ; la carte n’entre dans la coquille que par un import dynamique sous l’interrupteur', () => {
    expect(FONCTIONS.khatma_wird.defaut).toBe('off');
    expect((FONCTIONS.khatma_wird as { demo?: string }).demo).toBeUndefined();
    const page = lire('../../routes/coran/+page.svelte');
    expect(page).toMatch(/fn\('khatma_wird'\)[\s\S]{0,60}import\('\$lib\/khatma\/carte'\)/);
    expect(page).not.toMatch(/^\s*import .* from '\$lib\/khatma/m);
    expect(lire('../../../scripts/groupes.mjs')).toMatch(/lib\\\/khatma\\\/carte\\\.ts/);
  });

  it('toutes les clés utilisées par les écrans existent', () => {
    const src = ['./Carte.svelte', './Creation.svelte', './Reglages.svelte'].map(lire).join('\n');
    const cles = new Set([...src.matchAll(/['"`](kh\.[a-z_]+)['"`]/g)].map((m) => m[1]!));
    for (const m of src.matchAll(/`(kh\.[a-z_]+)_\$\{/g))
      for (const k of Object.keys(textes)) if (k.startsWith(m[1]!)) cles.add(k);
    for (const k of cles) expect(textes, k).toHaveProperty([k]);
  });
});
