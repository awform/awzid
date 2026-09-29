import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QURANIC_ROOTS_EXCLUDED, ROOT_ITEMS, verifyRootItems } from '../src/index.js';

const CONTENT = process.env.AWFORM_CONTENT_DIR ?? join(process.env.HOME ?? '', 'awform-content');
const L12 = join(CONTENT, 'data', 'ad2', 'l12.js');

describe('activité « racines » : rien d’inventé', () => {
  it('un élément dont une chaîne manque dans la leçon source est écarté', () => {
    const it0 = ROOT_ITEMS[0]!;
    const fake = `${it0.root} ${it0.scheme} ${it0.singular} ${it0.distractors.join(' ')}`; // sans le pluriel
    const r = verifyRootItems(new Map([[it0.source, fake]]), [it0]);
    expect(r.ok).toEqual([]);
    expect(r.rejected[0]!.reason).toContain(it0.plural);
  });
  it('leçon absente de l’édition : écarté ; racine coranique : toujours écartée', () => {
    expect(verifyRootItems(new Map(), [ROOT_ITEMS[0]!]).rejected[0]!.reason).toMatch(/absente/);
    const q = { ...ROOT_ITEMS[0]!, id: 'q', root: QURANIC_ROOTS_EXCLUDED[0]! };
    const r = verifyRootItems(new Map([[q.source, JSON.stringify(q)]]), [q]);
    expect(r.rejected[0]!.reason).toMatch(/coranique/);
  });
  it('aucune racine exclue n’est proposée ; chaque racine a trois lettres', () => {
    for (const x of ROOT_ITEMS) {
      expect(QURANIC_ROOTS_EXCLUDED).not.toContain(x.root);
      expect(x.root.split(' ')).toHaveLength(3);
      expect(x.distractors).not.toContain(x.plural);
    }
  });
  it.skipIf(!existsSync(L12))(
    'livre gelé Adultes N2, leçon 12 : tous les éléments y figurent mot pour mot',
    () => {
      const r = verifyRootItems(new Map([['ad2.l12', readFileSync(L12, 'utf8')]]));
      expect(r.rejected).toEqual([]);
      expect(r.ok).toHaveLength(ROOT_ITEMS.length);
    },
  );
});
