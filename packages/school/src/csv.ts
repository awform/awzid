/**
 * Export CSV pour l'école : séparateur « ; » et marque d'ordre UTF-8 (ouverture directe dans un tableur
 * en français), guillemets doublés, et neutralisation des formules (une cellule qui commence par =, +, -, @,
 * tabulation ou retour chariot est préfixée d'une apostrophe : pas d'injection de formule).
 */
export type Cell = string | number | boolean | null | undefined;

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly Cell[][]): string {
  const lines = [header.map(csvCell).join(';'), ...rows.map((r) => r.map(csvCell).join(';'))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
