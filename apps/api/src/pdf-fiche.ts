/**
 * V2-5 : fiche de la classe en PDF — une étiquette par élève (identifiant et mot de passe), à imprimer et découper.
 * A4, 10 étiquettes par page (2 colonnes x 5 lignes). PDF écrit à la main (aucune bibliothèque ajoutée) avec les
 * polices standard (Helvetica, Courier) : texte en WinAnsi ; un caractère hors de cette table devient « ? ».
 * Les mots de passe ne sont écrits nulle part ailleurs : ce document est fabriqué à la demande, jamais conservé.
 */

export interface Etiquette {
  prenom: string;
  login: string;
  motDePasse: string;
}

const LARGEUR = 595.28;
const HAUTEUR = 841.89;
const MARGE = 28;
const COLONNES = 2;
const LIGNES = 5;
export const ETIQUETTES_PAR_PAGE = COLONNES * LIGNES;

/** points de code hors Latin-1 présents dans WinAnsi (cp1252) */
const CP1252: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/** chaîne PDF « (…) » en WinAnsi, parenthèses et barre oblique échappées */
export function texteWinAnsi(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    let b: number;
    if (cp >= 0x20 && cp <= 0x7e) b = cp;
    else if (cp >= 0xa0 && cp <= 0xff) b = cp;
    else if (CP1252[cp] !== undefined) b = CP1252[cp]!;
    else b = 0x3f;
    const c = String.fromCharCode(b);
    out += c === '(' || c === ')' || c === '\\' ? `\\${c}` : c;
  }
  return `(${out})`;
}

const coupe = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function contenuPage(
  etiquettes: readonly Etiquette[],
  d: { ecole: string | null; classe: string; date: string },
): string {
  const w = (LARGEUR - 2 * MARGE) / COLONNES;
  const h = (HAUTEUR - 2 * MARGE) / LIGNES;
  const c: string[] = ['0.6 w', '[4 3] 0 d', '0.45 G'];
  etiquettes.forEach((e, i) => {
    const col = i % COLONNES;
    const lig = Math.floor(i / COLONNES);
    const x = MARGE + col * w;
    const yHaut = HAUTEUR - MARGE - lig * h;
    c.push(`${x.toFixed(2)} ${(yHaut - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    const t = (taille: number, police: string, dx: number, dy: number, s: string, gris = 0) =>
      c.push(
        `BT /${police} ${taille} Tf ${gris} g ${(x + dx).toFixed(2)} ${(yHaut - dy).toFixed(2)} Td ${texteWinAnsi(s)} Tj ET`,
      );
    const entete = [d.ecole, d.classe, d.date].filter(Boolean).join(' - ');
    t(8, 'F1', 14, 20, coupe(entete, 56), 0.35);
    t(16, 'F2', 14, 44, coupe(e.prenom, 26));
    t(8.5, 'F1', 14, 70, 'Identifiant', 0.35);
    t(17, 'F3', 14, 88, e.login);
    t(8.5, 'F1', 14, 110, 'Mot de passe', 0.35);
    t(17, 'F3', 14, 128, e.motDePasse);
    t(7, 'F1', 14, h - 10, 'Awzid - a garder avec soin, a ne montrer a personne', 0.45);
  });
  return c.join('\n');
}

/** PDF complet (octets Latin-1) */
export function ficheClassePdf(d: {
  ecole: string | null;
  classe: string;
  date: string;
  etiquettes: readonly Etiquette[];
}): Buffer {
  const pages: Etiquette[][] = [];
  for (let i = 0; i < d.etiquettes.length; i += ETIQUETTES_PAR_PAGE)
    pages.push(d.etiquettes.slice(i, i + ETIQUETTES_PAR_PAGE));
  if (!pages.length) pages.push([]);

  // objets : 1 catalogue, 2 pages, 3-5 polices, puis (page, contenu) par page
  const objets: string[] = [];
  const ids = pages.map((_, i) => 6 + i * 2);
  objets[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objets[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${ids.map((n) => `${n} 0 R`).join(' ')}] >>`;
  objets[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objets[4] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objets[5] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((p, i) => {
    const flux = contenuPage(p, d);
    objets[ids[i]!] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGEUR} ${HAUTEUR}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${ids[i]! + 1} 0 R >>`;
    objets[ids[i]! + 1] = `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const positions: number[] = [];
  for (let n = 1; n < objets.length; n++) {
    positions[n] = pdf.length;
    pdf += `${n} 0 obj\n${objets[n]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objets.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objets.length; n++)
    pdf += `${String(positions[n]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
