import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { memoriserTraduction, traductionVisible } from './traduction';

/** Lot 10 : bouton « Voir / Cacher la traduction » (décision du client du 15/10/2026). */
function memoire() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    m,
  };
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('traduction : défaut et choix par profil', () => {
  it('affichée par défaut (profil inconnu, aucun choix, stockage absent)', () => {
    expect(traductionVisible('p1', memoire())).toBe(true);
    expect(traductionVisible(null, memoire())).toBe(true);
    expect(traductionVisible('p1', null)).toBe(true);
  });

  it('choix mémorisé PAR PROFIL : cacher pour un profil ne touche pas les autres', () => {
    const s = memoire();
    memoriserTraduction('p1', false, s);
    expect(traductionVisible('p1', s)).toBe(false);
    expect(traductionVisible('p2', s)).toBe(true);
    expect(traductionVisible(null, s)).toBe(true);
    memoriserTraduction('p1', true, s);
    expect(traductionVisible('p1', s)).toBe(true);
    // appareil sans profil choisi : sa propre clé
    memoriserTraduction(null, false, s);
    expect(traductionVisible(undefined, s)).toBe(false);
    expect(traductionVisible('p1', s)).toBe(true);
    expect([...s.m.keys()].sort()).toEqual(['awz-trad:_', 'awz-trad:p1']);
  });

  it('stockage en panne (navigation privée) : jamais d’erreur, traduction visible', () => {
    const casse = {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('bloqué');
      },
    };
    expect(() => memoriserTraduction('p1', false, casse)).not.toThrow();
    expect(traductionVisible('p1', casse)).toBe(true);
  });
});

describe('traduction : là où le bouton s’applique', () => {
  it('lectures graduées, Madjaliss et leçons des livres partagent le même bouton et le même réglage', () => {
    for (const f of [
      '../routes/lectures/[code]/+page.svelte',
      './madjaliss/Seance.svelte',
      '../routes/lecons/[id]/+page.svelte',
    ]) {
      const c = src(f);
      expect(c, f).toContain("import BoutonTraduction from '$lib/BoutonTraduction.svelte'");
      expect(c, f).toContain('traductionVisible(');
      expect(c, f).toContain('memoriserTraduction(');
    }
    const b = src('./BoutonTraduction.svelte');
    expect(b).toContain("t('bib.cacher_traduction')");
    expect(b).toContain("t('bib.voir_traduction')");
  });

  it('Madjaliss : le mode enseignant montre toujours la traduction ; les notes ne sont jamais cachées', () => {
    const s = src('./madjaliss/Seance.svelte');
    expect(s).toContain('traduction={trad || modeEns}');
    const p = src('./madjaliss/Phrase.svelte');
    expect(p).toContain('{#if p.fr && traduction}');
    // notes d'explication : aucune condition sur la traduction
    expect(p).toMatch(/\{#each p\.notes \?\? \[\] as n, k \(k\)\}/);
  });

  it('leçons : consignes, explications de grammaire (notion), mots et lexique restent en français', () => {
    const l = src('../routes/lecons/[id]/+page.svelte');
    expect(l).toContain('{#if N.texte_fr}<p class="fr"><Bidi text={N.texte_fr} /></p>{/if}');
    expect(l).toContain('<span class="fr"><Bidi text={w.fr} /></span>');
    expect(l).toContain("<ArFr ar={x.ar} fr={x.fr ?? ''} verset={x.verset_tanzil} />");
    expect(l).toContain("fr={trad ? (p.fr ?? '') : ''}");
    expect(l).toContain('{#if r.fr && trad}');
    expect(l).toContain('{#if v.fr && trad}');
  });
});
