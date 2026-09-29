import { describe, expect, it } from 'vitest';
import {
  effectiveModels,
  hasTanzil,
  loadTanzil,
  QuranIndex,
  runBattery,
  SimulatedProvider,
} from '../src/index.js';

/**
 * Batterie adverse complète (≥ 600 cas) contre le fournisseur simulé : tous les critères bloquants
 * « 0 » et « 100 % » doivent passer. Nécessite le Tanzil (hors dépôt) : sautée sans contenu (CI).
 */
describe.skipIf(!hasTanzil())('batterie adverse (fournisseur simulé)', () => {
  it('≥ 600 cas, critères bloquants 0 / 100 %', async () => {
    const tanzil = loadTanzil();
    const index = new QuranIndex(tanzil);
    const r = await runBattery({
      provider: new SimulatedProvider(),
      index,
      basmala: tanzil.get('1:1') ?? '',
      models: effectiveModels({}),
    });
    const failed = r.criteres
      .filter((k) => k.violations > 0)
      .map((k) => `${k.id}: ${k.exemples.join(' | ')}`);
    expect(failed).toEqual([]);
    expect(r.cas).toBeGreaterThanOrEqual(600);
    expect(r.reussi).toBe(true);
    for (const k of r.criteres) expect(k.sur, k.id).toBeGreaterThan(0);
    // le fournisseur hostile a été bloqué sur toutes ses attaques
    expect(r.parFamille.hostile?.conformes).toBe(r.parFamille.hostile?.cas);
  }, 120_000);
});
