/**
 * Seuils de coût (décision du référent, 14/10/2026) : UNE alerte à 80 €/mois ; le « disjoncteur » coupe seulement les fonctions
 * coûteuses (écoute IA) et ne touche jamais à la machine ; coût fixe affiché ≈ 2 €/jour. Les documents disent tous la même chose.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { coutsCoupes, decisionEcouteIaParDefaut } from '../src/ecoute-ia.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const lire = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const req = { auth: { accountId: 'a1' } } as never;

describe('disjoncteur de coût : fonctions coûteuses seulement', () => {
  const avant = { ...process.env };
  afterEach(() => {
    process.env = { ...avant };
  });

  it('AWFORM_COUTS_COUPES=1 ferme l’écoute IA même ouverte ; sans lui, rien ne change', () => {
    process.env.AWFORM_ECOUTE_IA = 'on';
    delete process.env.AWFORM_COUTS_COUPES;
    expect(coutsCoupes()).toBe(false);
    expect(decisionEcouteIaParDefaut(req)).toBe(true);
    process.env.AWFORM_COUTS_COUPES = '1';
    expect(coutsCoupes()).toBe(true);
    expect(decisionEcouteIaParDefaut(req)).toBe(false);
    process.env.AWFORM_COUTS_COUPES = '0';
    expect(decisionEcouteIaParDefaut(req)).toBe(true);
  });

  it('coût fixe par défaut : 2 €/jour (≈ 60 €/mois), alerte du jour à 4 €', () => {
    const src = lire('apps', 'api', 'src', 'plafonds.ts');
    expect(src).toMatch(/AWFORM_COUT_FIXE_JOUR_EUR \?\? 2\) \|\| 2/);
    expect(src).toMatch(/AWFORM_COUT_ALERTE_JOUR_EUR \?\? 4\) \|\| 4/);
  });

  it('le disjoncteur n’arrête plus aucune machine : plus de fonction, plus d’appel à instances.stop', () => {
    expect(existsSync(join(ROOT, 'infra', 'gcp', 'disjoncteur'))).toBe(false);
    for (const f of ['plafond-budget.sh', 'creer-ressources.sh', 'deployer-beta.sh'])
      expect(lire('infra', 'gcp', f).replace(/^\s*#.*$/gm, ''), f).not.toMatch(
        /instances stop|instances\.stop|compute\.instances\.stop/,
      );
  });
});

describe('documents : un seul jeu de seuils', () => {
  const docs = ['COUTS_BETA.md', 'EXPLOITATION.md', 'GUIDE_BETA_CLIENT.md'].map((f) => [
    f,
    lire('docs', 'projet', f),
  ]);
  it.each(docs)(
    '%s : alerte à 80 €, aucune alerte à 10 € / 45 € / 60 € ni machine arrêtée par le budget',
    (_f, d) => {
      expect(d).toMatch(/80 €/);
      expect(d).not.toMatch(
        /alerte (de |à )?(10|45|60) ?€|10 € par mois|plafond de (45|60) ?€|45 € qui|PLAFOND_EUR/i,
      );
      expect(d).not.toMatch(/ARRÊTE la VM|arrête la machine/i);
    },
  );
  it('la valeur codée du coût fixe est celle des documents (2 €/jour)', () => {
    for (const [f, d] of docs)
      if (f !== 'GUIDE_BETA_CLIENT.md')
        expect(d, f).toMatch(/2 €\s?(\/|par) ?jour|2 € par défaut|≈ 2 €/);
    expect(lire('docs', 'projet', 'COUTS_BETA.md')).toMatch(/AWFORM_COUTS_COUPES=1/);
  });
});
