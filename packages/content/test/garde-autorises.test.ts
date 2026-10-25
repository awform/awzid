/**
 * Textes autorisés à la voix de synthèse malgré la garde coranique (« zéro muet », décisions du référent du
 * 24/10/2026) : `data/zero-muet/garde-autorises.json` → `src/garde-autorises.ts` (généré :
 * `GARDE_AUTORISES=ecrire pnpm --filter @awform/content test garde-autorises`).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audioKey, skeleton } from '../src/audio-cle.js';
import {
  BASMALA_COMPLETE,
  autorise,
  autoriseCle,
  gardeCoran,
  refusVoix,
} from '../src/garde-coran.js';
import { GARDE_AUTORISES } from '../src/garde-autorises.js';
import { loadTanzil } from '../src/index.js';
import { CONTENT_DIR } from './helpers.js';

interface Entree {
  cle: string;
  decision: string;
  raison: string;
}
const data = JSON.parse(
  readFileSync(new URL('../data/zero-muet/garde-autorises.json', import.meta.url), 'utf8'),
) as { textes: Entree[] };

describe('textes autorisés à la voix (zéro muet)', () => {
  it('la liste du code suit le fichier de données relu (GARDE_AUTORISES=ecrire)', () => {
    const want = [...new Set(data.textes.map((t) => autoriseCle(t.cle)))].sort().join(' ');
    if (process.env.GARDE_AUTORISES === 'ecrire') {
      const p = new URL('../src/garde-autorises.ts', import.meta.url);
      writeFileSync(
        p,
        readFileSync(p, 'utf8').replace(
          /export const GARDE_AUTORISES =\s*'[^']*';/,
          `export const GARDE_AUTORISES =\n  '${want}';`,
        ),
      );
      return;
    }
    expect(GARDE_AUTORISES, 'GARDE_AUTORISES=ecrire').toBe(want);
  });

  it('chaque entrée : décision « synthese », raison écrite, jamais la Basmala, clé unique', () => {
    const vues = new Set<string>();
    for (const t of data.textes) {
      expect(t.decision, t.cle).toBe('synthese');
      expect(t.raison.length, t.cle).toBeGreaterThan(10);
      expect(skeleton(t.cle).includes(BASMALA_COMPLETE), `Basmala : ${t.cle}`).toBe(false);
      const k = audioKey(t.cle);
      expect(vues.has(k), `doublon : ${t.cle}`).toBe(false);
      vues.add(k);
      expect(autorise(t.cle), t.cle).toBe(true);
    }
    expect(data.textes.length).toBeGreaterThan(0);
  });

  const TSV = join(CONTENT_DIR, 'coran', 'tanzil-uthmani.tsv');
  const tanzil = existsSync(TSV) ? loadTanzil(readFileSync(TSV, 'utf8')) : null;
  it.skipIf(!tanzil)(
    'la garde accepte les textes autorisés ; un verset ou une Basmala reste refusé',
    () => {
      const cleVerset = (k: string) => k.split(':').map(Number) as [number, number];
      const verses = [...tanzil!.entries()]
        .sort(([a], [b]) => {
          const [x, y] = cleVerset(a);
          const [u, v] = cleVerset(b);
          return x - u || y - v;
        })
        .map(([, v]) => v);
      const g = gardeCoran(verses);
      for (const t of data.textes) expect(refusVoix(audioKey(t.cle), g), t.cle).toBeNull();
      // sans la liste, un verset entier reste refusé (récitation d'Ayyūb)
      const v = audioKey(tanzil!.get('112:1')!);
      expect(autorise(v)).toBe(false);
      expect(refusVoix(v, g)).not.toBeNull();
      expect(refusVoix(audioKey(tanzil!.get('1:1')!), g)).not.toBeNull();
    },
  );
});
