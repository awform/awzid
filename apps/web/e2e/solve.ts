import { expect, type Locator, type Page } from '@playwright/test';

/** Outils de test : résoudre un exercice PAR L'INTERFACE à partir du corrigé (projection d'entraînement). */
export const plain = (s: unknown) => String(s ?? '').replace(/[[\]]/g, '');
export const bare = (s: unknown) => String(s ?? '').replace(/[ً-ٰٟـ[\]]/g, '');

type Obj = Record<string, unknown> & { type: string };
type Item = Record<string, unknown>;

function ordreSolution(mots: string[], phrase: string): number[] {
  const target = plain(phrase).trim();
  const sep = target.includes(' ') ? ' ' : '';
  const labels = mots.map(plain);
  const used = labels.map(() => false);
  const path: number[] = [];
  const walk = (rest: string): boolean => {
    if (path.length === labels.length) return rest === '';
    for (let k = 0; k < labels.length; k++) {
      if (used[k]) continue;
      const piece = labels[k] + (path.length === labels.length - 1 ? '' : sep);
      if (!rest.startsWith(piece)) continue;
      used[k] = true;
      path.push(k);
      if (walk(rest.slice(piece.length))) return true;
      used[k] = false;
      path.pop();
    }
    return false;
  };
  if (!walk(target)) throw new Error(`ordre impossible : ${target}`);
  return path;
}

export async function solveExercise(page: Page, id: string, ex: Obj): Promise<number> {
  const sec: Locator = page.locator(`section.ex[data-exercise="${id}"]`);
  await sec.scrollIntoViewIfNeeded();
  const items = (ex.items ?? []) as Item[];
  let total = items.length;
  switch (ex.type) {
    case 'premiere_lettre':
    case 'ecoute':
    case 'complete':
      for (let i = 0; i < items.length; i++) {
        const it = items[i]!;
        const want =
          ex.type === 'premiere_lettre'
            ? String(it.reponse)
            : plain(ex.type === 'ecoute' ? it.reponse || it.dit : it.reponse);
        const opts = it.options as string[];
        const k = opts.findIndex((o) =>
          ex.type === 'premiere_lettre' ? o === want : plain(o) === want,
        );
        await sec.locator(`[data-item="${i}"] .opts button`).nth(k).click();
      }
      break;
    case 'vrai_faux':
      for (let i = 0; i < items.length; i++)
        await sec.locator(`[data-item="${i}"] button[data-v="${items[i]!.vrai ? 1 : 0}"]`).click();
      break;
    case 'relier':
      for (let i = 0; i < items.length; i++) {
        await sec.locator(`button[data-side="a"][data-k="${i}"]`).click();
        await sec.locator(`button[data-side="b"][data-k="${i}"]`).click();
      }
      break;
    case 'chasse': {
      const grille = ex.grille as string[];
      const targets = grille.flatMap((x, k) => (bare(x) === bare(ex.cible) ? [k] : []));
      total = targets.length;
      for (const k of targets) await sec.locator(`button[data-item="${k}"]`).click();
      break;
    }
    case 'contient': {
      const mots = ex.mots as Array<{ oui: boolean }>;
      const targets = mots.flatMap((m, k) => (m.oui ? [k] : []));
      total = targets.length;
      for (const k of targets) await sec.locator(`button[data-item="${k}"]`).click();
      break;
    }
    case 'ordre':
      for (let i = 0; i < items.length; i++) {
        const it = items[i]!;
        for (const k of ordreSolution(it.mots as string[], String(it.phrase)))
          await sec.locator(`li[data-item="${i}"] button[data-w="${k}"]`).click();
      }
      break;
    default:
      return 0;
  }
  await expect(sec.locator('.score')).toContainText(`★ ${total} / ${total}`);
  return total;
}

export async function unitData(page: Page, id: string) {
  const r = await page.request.get(`/api/v1/units/${id}`);
  return (await r.json()) as {
    unit: {
      lesson: { exercices: Obj[]; checklist?: unknown[]; objectifs?: unknown[] };
      exercises: Array<{ id: string }>;
    };
  };
}
