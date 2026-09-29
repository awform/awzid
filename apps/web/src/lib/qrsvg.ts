/**
 * QR code en SVG (lot 20 : vérification des certificats) — bibliothèque `qrcode-generator` (MIT), niveau de
 * correction M. Renvoie la taille (modules) et le tracé : le composant l'affiche sans HTML brut.
 */
import qrcode from 'qrcode-generator';

export function qrPath(text: string): { size: number; d: string } {
  const q = qrcode(0, 'M');
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return { size: n + 8, d };
}

/** Adresse de vérification imprimée dans le QR du certificat. */
export function verifyUrl(origin: string, number: string, code: string): string {
  return `${origin}/verifier/${encodeURIComponent(number)}?c=${encodeURIComponent(code)}`;
}
