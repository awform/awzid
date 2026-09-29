/**
 * Correction sur l'appareil des exercices des livres de religion (entraînement : jamais de note ; les
 * corrigés viennent du livre). Fonctions pures, testées.
 */

/** QCM et cas : la réponse du livre est l'indice de l'option ou son texte. */
export function qcmOk(item: { options?: unknown[]; reponse?: unknown }, choice: number): boolean {
  const r = item.reponse;
  if (typeof r === 'number') return r === choice;
  return String(item.options?.[choice] ?? '') === String(r ?? '');
}

/** Ordre (étapes, frise) : `order` = indices des items dans l'ordre choisi. */
export function orderOk(
  items: ReadonlyArray<{ rang?: number }>,
  order: readonly number[],
): boolean {
  if (order.length !== items.length) return false;
  const ranks = items.map((it, i) => it.rang ?? i + 1);
  for (let k = 1; k < order.length; k++)
    if (ranks[order[k]!]! < ranks[order[k - 1]!]!) return false;
  return true;
}

/** Calcul : réponse numérique à la tolérance près (virgule française acceptée). */
export function calculOk(item: { reponse?: unknown; tolerance?: number }, input: string): boolean {
  const v = Number(input.replace(/\s/g, '').replace(',', '.'));
  const r = Number(item.reponse);
  if (!Number.isFinite(v) || !Number.isFinite(r)) return false;
  return Math.abs(v - r) <= (item.tolerance ?? 0) + 1e-9;
}

/** Texte à trous : segments autour des « ___ ». */
export function holes(text: string): string[] {
  return text.split(/_{3,}/);
}

export function shuffle<T>(xs: readonly T[], seed = 7): T[] {
  const a = [...xs];
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  // jamais l'ordre du livre (sinon rien à faire)
  if (a.length > 1 && a.every((x, i) => x === xs[i])) a.push(a.shift()!);
  return a;
}
