/**
 * QR code de vérification des certificats (lot 20), calculé par l'API (A39 : la bibliothèque `qrcode-generator`,
 * MIT, n'est plus dans le paquet de l'application — poids). Niveau de correction M ; renvoie la taille (modules,
 * zone de silence comprise) et le tracé SVG, affiché sans HTML brut.
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

/** Adresse du site donnée par l'appareil (`location.origin`) : seulement une origine http(s) bien formée. */
export const ORIGIN = '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$';

/** QR d'un certificat scellé pour cette origine (sans code de vérification : aucun). */
export function certQr(
  origin: string | undefined,
  c: { number: string; verifCode: string | null },
) {
  return origin && c.verifCode && new RegExp(ORIGIN).test(origin)
    ? qrPath(verifyUrl(origin, c.number, c.verifCode))
    : null;
}
