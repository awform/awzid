/**
 * Cahiers « Je parle » des niveaux 3 et suivants (25/10/2026) : adultes 3 à 10, enfants 2 à 5, ados 2 à 4. Les données de
 * l'application sont la conversion EXACTE de la source unique (`packages/content/data/cahier-parler/<niveau>.json`),
 * l'arabe est recopié octet pour octet, chaque thème est une étape, chaque partie finit par sa révision, sa situation
 * libre et son bilan, et les étiquettes « à qui je parle » suivent le public (garçon / fille pour les enfants et les ados).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NIVEAUX_PARLER, convertir, serieDe } from '../../../scripts/cahier-parler-donnees.mjs';
import { PARLER_NIVEAUX } from '../cahier-parler-niveaux';
import { etoiles, formes, progresVide, type CahierParler } from './donnees';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const habillage = JSON.parse(
  lire('../../../../../packages/content/data/cahier-parler/themes.json'),
) as { antiseche_ar: string };
const PICTOS = [...lire('./Picto.svelte').matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
const AR = /[؀-ۿ]/;

interface Source {
  meta: { titre: string };
  parties: Array<{ n: number; themes: string[] }>;
  themes: Array<{ code: string; phrases: string[]; conversations: string[] }>;
  phrases: Array<{
    id: string;
    ar: string;
    variations: Record<string, { ar: string } | null> | null;
  }>;
  conversations: Array<{ id: string; repliques: Array<{ ar: string }> }>;
}

const NOUVEAUX = NIVEAUX_PARLER.filter((n: string) => n !== 'ad2');

describe('cahiers « Je parle » : 16 niveaux', () => {
  it('l’accès du niveau existe pour les 16 niveaux (adultes 2 à 10, enfants 2 à 5, ados 2 à 4)', () => {
    expect(PARLER_NIVEAUX).toEqual(NIVEAUX_PARLER);
    expect(PARLER_NIVEAUX).toHaveLength(16);
    expect([...PARLER_NIVEAUX].sort()).toEqual(
      [
        ...['ad2', 'ad3', 'ad4', 'ad5', 'ad6', 'ad7', 'ad8', 'ad9', 'ad10'],
        ...['en2', 'en3', 'en4', 'en5'],
        ...['ado2', 'ado3', 'ado4'],
      ].sort(),
    );
    expect(NOUVEAUX).toHaveLength(15);
    expect(['ad3', 'en2', 'ado4'].map(serieDe)).toEqual(['ad', 'en', 'ado']);
  });
});

for (const n of NOUVEAUX) {
  describe(`cahier « Je parle » ${n}`, () => {
    const src = JSON.parse(
      lire(`../../../../../packages/content/data/cahier-parler/${n}.json`),
    ) as Source;
    const app = JSON.parse(lire(`../../../static/cahier-data/parler-${n}.json`)) as CahierParler;
    const jeune = serieDe(n) !== 'ad';

    it('le fichier de l’application est exactement la conversion de la source', () => {
      expect(JSON.parse(JSON.stringify(convertir(src, n, habillage)))).toEqual(app);
      expect(app.niveau).toBe(n);
      expect(app.antiseche_ar).toBe(habillage.antiseche_ar);
    });

    it('arabe octet pour octet : phrases (toutes leurs formes) et répliques', () => {
      expect(Object.keys(app.phrases)).toEqual(src.phrases.map((p) => p.id));
      for (const p of src.phrases) {
        const a = app.phrases[p.id]!;
        expect(a.ar).toBe(p.ar);
        if (p.variations?.masculin && p.variations.feminin)
          expect(a.f!.map((f) => f.ar)).toEqual([
            p.variations.masculin.ar,
            p.variations.feminin.ar,
          ]);
      }
      expect(Object.keys(app.conversations)).toEqual(src.conversations.map((c) => c.id));
      for (const c of src.conversations)
        expect(app.conversations[c.id]!.r.map((r) => r.ar)).toEqual(c.repliques.map((r) => r.ar));
    });

    it('une étape par thème, dans l’ordre des parties du livre ; une fin par partie, puis la grille finale', () => {
      expect(app.parties.map((p) => p.n)).toEqual([1, 2, 3, 4, 5]);
      const attendus = src.parties.flatMap((p) => p.themes);
      expect(attendus).toHaveLength(src.themes.length);
      const etapes = app.etapes.filter((e) => !e.fin);
      expect(etapes.map((e) => e.theme)).toEqual(attendus);
      expect(etapes.map((e) => e.num)).toEqual(etapes.map((_, i) => i + 1));
      expect(app.etapes.filter((e) => e.fin).map((e) => e.id)).toEqual([
        'fin1',
        'fin2',
        'fin3',
        'fin4',
        'fin5',
        'finale',
      ]);
      for (const e of etapes) {
        expect(e.n).toBeGreaterThanOrEqual(0);
        expect(e.n).toBeLessThanOrEqual(25);
        expect(
          e.pages.some((p) => p.type === 'cartes'),
          e.id,
        ).toBe(true);
        expect(
          e.pages.some((p) => p.type === 'conversation'),
          e.id,
        ).toBe(true);
      }
    });

    it('toutes les phrases et conversations sont travaillées dans une étape ; références connues', () => {
      const refs = new Set(app.etapes.flatMap((e) => e.pages.flatMap((p) => p.refs)));
      for (const id of [...Object.keys(app.phrases), ...Object.keys(app.conversations)])
        expect(refs.has(id), id).toBe(true);
      for (const r of refs) expect(app.phrases[r] ?? app.conversations[r], r).toBeTruthy();
      // chaque thème de la source garde exactement ses phrases et conversations dans son étape
      for (const t of src.themes) {
        const e = app.etapes.find((x) => x.theme === t.code)!;
        const vus = new Set(e.pages.flatMap((p) => p.refs));
        for (const c of t.conversations) expect(vus.has(c), `${t.code} ${c}`).toBe(true);
        for (const p of t.phrases) expect(vus.has(p), `${t.code} ${p}`).toBe(true);
      }
    });

    it('chaque étape : pictogramme dessiné, titre, accroche, phrase du jour, antisèche de 8 à 16 lignes', () => {
      for (const e of app.etapes) expect(PICTOS, e.id).toContain(e.picto);
      for (const e of app.etapes.filter((x) => !x.fin)) {
        expect(e.titre && e.accroche && e.jour?.ar, e.id).toBeTruthy();
        const l = e.antiseche!;
        expect(l.length, e.id).toBeGreaterThanOrEqual(8);
        expect(l.length, e.id).toBeLessThanOrEqual(16);
        expect(new Set(l.map(([ar]) => ar)).size).toBe(l.length);
        // chaque ligne est une forme d'une phrase ou une réplique du cahier
        const textes = new Set<string>();
        for (const p of Object.values(app.phrases)) for (const f of formes(p)) textes.add(f.ar);
        for (const c of Object.values(app.conversations)) for (const r of c.r) textes.add(r.ar);
        for (const [ar] of l) expect(textes.has(ar), ar).toBe(true);
      }
    });

    it('étiquettes et titres sans arabe ; l’arabe cité dans une traduction passe par Bidi (3 mots ou plus : sa propre ligne)', () => {
      for (const p of Object.values(app.phrases))
        for (const f of formes(p)) {
          expect(AR.test(f.u ?? '')).toBe(false);
        }
      for (const c of Object.values(app.conversations)) {
        expect(AR.test(c.titre), c.titre).toBe(false);
      }
      for (const t of Object.values(app.themes)) expect(AR.test(t), t).toBe(false);
    });

    it('étiquettes « à qui je parle » : garçon / fille pour les enfants et les ados, homme / femme pour les adultes', () => {
      const etiquettes = new Set<string>();
      for (const p of Object.values(app.phrases))
        for (const f of formes(p)) if (f.u) etiquettes.add(f.u);
      const tout = [...etiquettes].join(' | ');
      if (jeune) {
        expect(tout).toContain('à un garçon');
        expect(tout).toContain('à une fille');
        expect(tout).not.toMatch(/\b(homme|femme)s?\b/);
      } else {
        expect(tout).toContain('à un homme');
        expect(tout).toContain('à une femme');
        expect(tout).not.toMatch(/garçon|fille/);
      }
    });

    it('bilans : une étoile par thème de la partie ; grille finale : une étoile par thème du niveau', () => {
      for (const pa of src.parties) {
        const bilan = app.etapes
          .find((e) => e.id === `fin${pa.n}`)!
          .pages.find((p) => p.type === 'bilan')!;
        expect(etoiles(app, bilan, progresVide()).map((x) => x.theme)).toEqual(pa.themes);
        // révision et situation libre de la partie
        const fin = app.etapes.find((e) => e.id === `fin${pa.n}`)!;
        expect(fin.pages.map((p) => p.type)).toEqual(['revision', 'tuteur', 'bilan']);
        expect(fin.pages.find((p) => p.type === 'tuteur')!.refs.length).toBeGreaterThan(1);
      }
      const finale = app.etapes.find((e) => e.id === 'finale')!.pages[0]!;
      expect(finale.type).toBe('bilan');
      expect(etoiles(app, finale, progresVide())).toHaveLength(src.themes.length);
    });
  });
}
