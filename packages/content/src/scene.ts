/**
 * Scènes des leçons : portage fidèle de `scene()` / `bubble()` / `flowers()` du moteur des livres
 * (awform/awform.js, l. 89-154). Produit une chaîne SVG qui référence les illustrations par
 * `<use href="#i-<clé>">` (symboles fournis par la page). Personnages : uniquement ceux de la charte,
 * dessinés sans visage (zz-sansvisage.js). Aucun script ; texte arabe échappé.
 */
import { letterColorIndex, plain } from './text.js';

export interface SceneSpec {
  lieu?: string;
  persos?: string[];
  props?: string[];
  bulle_ar?: string;
  bulle_fr?: string;
  alt_fr?: string;
  tableau?: string;
}

type Has = (key: string) => boolean;

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function sceneSvg(
  spec: SceneSpec | undefined,
  lettres: ReadonlyArray<{ l: string }> = [],
  has: Has = () => true,
): string {
  const S = spec ?? {};
  const lieu = S.lieu || 'classe';
  const persos =
    S.persos || (lieu === 'classe' ? ['fatou', 'maryam', 'youssouf'] : ['youssouf', 'maryam']);
  const props = S.props || [];
  const use = (k: string, x: number, y: number, w: number, h: number) =>
    has(k)
      ? `<use href="#i-${esc(k)}" x="${x}" y="${y}" width="${w}" height="${h}"/>`
      : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#F3E7D0" stroke="#E5484D" stroke-dasharray="4 4"/>`;
  const bubble = (x: number, y: number, w: number) => {
    if (!S.bulle_ar) return '';
    const lines = S.bulle_ar.split('|');
    const h = 26 + lines.length * 30;
    let t = `<path d="M${x + 18} ${y}h${w - 36}a18 18 0 0118 18v${h - 36}a18 18 0 01-18 18H${x + 60}l-24 20 4-20h-22a18 18 0 01-18-18V${y + 18}a18 18 0 0118-18z" fill="#fff" stroke="#E6DCC8" stroke-width="2"/>`;
    lines.forEach((l, i) => {
      t += `<text x="${x + w / 2}" y="${y + 36 + i * 30}" text-anchor="middle" font-family="Noto Naskh Arabic, serif" font-weight="700" font-size="20" fill="#173B57" direction="rtl">${esc(plain(l))}</text>`;
    });
    return t;
  };
  const flowers = () =>
    `<g color="#F28AB2">${use('flower', 60, 300, 18, 18)}${use('flower', 300, 322, 16, 16)}${use('flower', 740, 310, 18, 18)}</g><g color="#fff">${use('flower', 200, 298, 14, 14)}${use('flower', 470, 330, 14, 14)}</g>`;
  let o = '';
  if (lieu === 'classe' || lieu === 'jardin' || lieu === 'ecole') {
    o += `<rect width="800" height="360" fill="#CFEAF7"/>${use('sun', 30, 20, 70, 70)}<g color="#D8E9F0">${use('mosque', 570, 80, 200, 140)}</g><path d="M0 240c200-26 420-22 800 0v120H0z" fill="#BFE0A8"/><path d="M0 280c240-20 520-16 800 6v74H0z" fill="#A6D38D"/>${use('palm', -20, 60, 130, 210)}${use('palm', 700, 70, 120, 200)}`;
    if (lieu !== 'jardin') {
      const tab = S.tableau != null ? S.tableau : lettres.map((x) => x.l).join(' ');
      const parts = tab.split(' ');
      const cols = ['#FF8D8F', '#8DB8FF', '#6BE0AE', '#FFD27A'];
      o += `<rect x="112" y="60" width="250" height="150" rx="10" fill="#1F5E4B" stroke="#9A6A3F" stroke-width="8"/><path d="M140 206v40M334 206v40" stroke="#9A6A3F" stroke-width="6"/><text x="237" y="158" text-anchor="middle" font-family="Noto Naskh Arabic, serif" font-weight="700" font-size="${tab.length > 10 ? 40 : 64}" direction="rtl">${parts.map((p) => `<tspan fill="${cols[letterColorIndex(p, lettres)]}">${esc(plain(p))}</tspan>`).join('<tspan> </tspan>')}</text>`;
    }
    const xs = [330, 480, 590, 690];
    persos.forEach((p, i) => {
      const big = p === 'fatou' || p === 'papa';
      o += use(p, xs[i] ?? 600, big ? 120 : 188, big ? 170 : 120, big ? 221 : 156);
    });
    props.forEach((p, i) => (o += use(p, 40 + i * 80, 270, 70, 70)));
    o += bubble(430, 24, 236);
  } else if (lieu === 'marche') {
    o += `<rect width="800" height="360" fill="#FFE7C2"/><path d="M0 250h800v110H0z" fill="#E6C98E"/>${use('palm', -20, 40, 120, 200)}${use('stall', 170, 40, 460, 318)}`;
    props.slice(0, 5).forEach((p, i) => (o += use(p, 250 + i * 62, 160, 62, 62)));
    o +=
      use(persos[0] || 'youssouf', 50, 170, 120, 156) +
      use(persos[1] || 'maryam', 640, 170, 120, 156);
    o += bubble(540, 10, 240);
  } else if (lieu === 'maison') {
    o += `<rect width="800" height="360" fill="#FCEBD5"/><rect y="270" width="800" height="90" fill="#E2C29B"/><rect x="520" y="40" width="200" height="140" rx="8" fill="#BFE3F4" stroke="#fff" stroke-width="10"/><path d="M620 40v140M520 110h200" stroke="#fff" stroke-width="6"/><rect x="250" y="220" width="300" height="16" rx="6" fill="#B5763F"/><path d="M270 236v70M530 236v70" stroke="#8A5530" stroke-width="10"/>`;
    props.slice(0, 4).forEach((p, i) => (o += use(p, 270 + i * 68, 158, 64, 64)));
    o +=
      use(persos[0] || 'youssouf', 60, 200, 120, 156) +
      use(persos[1] || 'maryam', 610, 200, 120, 156);
    o += bubble(40, 20, 240);
  } else if (lieu === 'mosquee') {
    o += `<rect width="800" height="360" fill="#CFEAF7"/><g color="#E9D6AE">${use('mosque', 250, 40, 300, 210)}</g><path d="M0 250h800v110H0z" fill="#EFD9A9"/>${use('palm', -10, 70, 130, 210)}${use('palm', 690, 70, 130, 210)}`;
    o +=
      use(persos[0] || 'papa', 110, 160, 150, 195) +
      use(persos[1] || 'youssouf', 560, 196, 120, 156);
    o += bubble(540, 20, 240);
  } else if (lieu === 'voyage') {
    o += `<rect width="800" height="360" fill="#CFEAF7"/>${use('sun', 680, 20, 70, 70)}<g fill="#fff" opacity=".9"><ellipse cx="160" cy="60" rx="50" ry="14"/><ellipse cx="520" cy="90" rx="40" ry="12"/></g>${has('airplane') ? use('airplane', 300, 20, 160, 110) : ''}<path d="M0 250h800v110H0z" fill="#C9CFD6"/><path d="M0 300h800" stroke="#fff" stroke-width="6" stroke-dasharray="40 30"/>${has('station') ? use('station', 480, 110, 220, 160) : '<rect x="500" y="140" width="220" height="110" rx="8" fill="#E6D3B3"/><rect x="520" y="165" width="180" height="40" fill="#9FD3F5"/>'}`;
    props.slice(0, 3).forEach((p, i) => (o += use(p, 220 + i * 80, 220, 72, 72)));
    o +=
      use(persos[0] || 'youssouf', 40, 200, 120, 156) +
      use(persos[1] || 'maryam', 140, 204, 110, 143);
    o += bubble(40, 14, 240);
  } else if (lieu === 'hopital') {
    o += `<rect width="800" height="360" fill="#EAF4F8"/><rect y="270" width="800" height="90" fill="#D9E3E8"/><rect x="470" y="60" width="280" height="210" rx="6" fill="#fff" stroke="#C8D2DD" stroke-width="4"/><rect x="590" y="80" width="40" height="40" rx="4" fill="#E5484D"/><path d="M610 86v28M596 100h28" stroke="#fff" stroke-width="8"/>${[500, 560, 660, 720].map((x) => `<rect x="${x}" y="140" width="34" height="34" rx="3" fill="#9FD3F5"/>`).join('')}<rect x="585" y="200" width="50" height="70" fill="#9FD3F5"/><rect x="120" y="220" width="220" height="14" rx="6" fill="#B5763F"/>`;
    props.slice(0, 3).forEach((p, i) => (o += use(p, 140 + i * 70, 150, 64, 64)));
    o +=
      use(persos[0] || 'papa', 40, 190, 130, 169) + use(persos[1] || 'maman', 330, 200, 120, 156);
    o += bubble(40, 14, 240);
  } else if (lieu === 'desert' || lieu === 'plage' || lieu === 'stade') {
    if (lieu === 'desert')
      o += `<rect width="800" height="360" fill="#FBE3B8"/>${use('sun', 620, 20, 90, 90)}<path d="M0 230c120-40 240-40 360 0s240 40 440-10v140H0z" fill="#EFC98A"/><path d="M0 280c160-30 320-20 480 10s220 10 320-10v80H0z" fill="#E3B46B"/>${use('palm', 640, 90, 120, 190)}`;
    else if (lieu === 'plage')
      o += `<rect width="800" height="360" fill="#CFEAF7"/>${use('sun', 60, 20, 80, 80)}<path d="M0 200h800v70H0z" fill="#4FA8D8"/><path d="M0 214q40-10 80 0t80 0 80 0 80 0 80 0 80 0 80 0 80 0 80 0 80 0" fill="none" stroke="#fff" stroke-width="3" opacity=".7"/><path d="M0 260c200-14 520-14 800 0v100H0z" fill="#F4DDA6"/>${use('palm', 680, 70, 120, 200)}`;
    else
      o += `<rect width="800" height="360" fill="#CFEAF7"/><path d="M0 170h800v190H0z" fill="#6BBF59"/><g stroke="#fff" stroke-width="4" fill="none" opacity=".85"><path d="M40 330L140 190H660L760 330z"/><path d="M400 190v140"/><ellipse cx="400" cy="255" rx="60" ry="22"/></g><rect x="360" y="150" width="80" height="40" fill="none" stroke="#fff" stroke-width="4"/>`;
    props.slice(0, 3).forEach((p, i) => (o += use(p, 260 + i * 90, 220, 80, 80)));
    o +=
      use(persos[0] || 'youssouf', 50, 200, 120, 156) +
      use(persos[1] || 'maryam', 620, 204, 110, 143);
    o += bubble(40, 14, 240);
  } else if (lieu === 'rue') {
    const houses: Array<[number, number, string]> = [
      [20, 120, '#F6DDB5'],
      [190, 90, '#FCE3C4'],
      [360, 130, '#E8D5F2'],
      [530, 100, '#DFF5EA'],
      [680, 120, '#FDE8E8'],
    ];
    o += `<rect width="800" height="360" fill="#D5EEF9"/><g>${houses.map(([x, y, c]) => `<rect x="${x}" y="${y}" width="150" height="${260 - y}" rx="4" fill="${c}"/><rect x="${x + 20}" y="${y + 20}" width="30" height="30" rx="3" fill="#9FD3F5"/><rect x="${x + 95}" y="${y + 20}" width="30" height="30" rx="3" fill="#9FD3F5"/>`).join('')}</g><path d="M0 260h800v100H0z" fill="#B8BEC6"/><path d="M0 300h800" stroke="#fff" stroke-width="5" stroke-dasharray="36 26"/>`;
    props.slice(0, 3).forEach((p, i) => (o += use(p, 300 + i * 90, 210, 80, 80)));
    o +=
      use(persos[0] || 'youssouf', 60, 200, 120, 156) +
      use(persos[1] || 'maryam', 620, 204, 110, 143);
    o += bubble(40, 14, 240);
  } else if (lieu === 'ferme') {
    o += `<rect width="800" height="360" fill="#D5EEF9"/><path d="M0 220c220-20 520-20 800 0v140H0z" fill="#A6D38D"/><path d="M560 200V120l70-50 70 50v80z" fill="#D9534F"/><rect x="605" y="140" width="50" height="60" fill="#8A3A36"/><g stroke="#C9A77A" stroke-width="6"><path d="M0 250h800M0 280h800"/></g><g stroke="#B5763F" stroke-width="8">${[40, 160, 280, 400, 520, 640, 760].map((x) => `<path d="M${x} 236v60"/>`).join('')}</g>`;
    props.slice(0, 4).forEach((p, i) => (o += use(p, 160 + i * 110, 230, 100, 100)));
    o += use(persos[0] || 'youssouf', 30, 196, 120, 156);
    o += bubble(40, 14, 240);
  } else if (lieu === 'veillee') {
    const pv = S.persos || ['grandpere', 'maryam', 'youssouf'];
    o += `<rect width="800" height="360" fill="#34406E"/><rect x="540" y="36" width="210" height="150" rx="8" fill="#16234A" stroke="#E9D6AE" stroke-width="10"/><path d="M645 36v150M540 111h210" stroke="#E9D6AE" stroke-width="5"/><path d="M700 60a22 22 0 100 44 17 17 0 010-44z" fill="#FFD447"/><g fill="#fff"><circle cx="580" cy="70" r="2.5"/><circle cx="615" cy="150" r="2"/><circle cx="600" cy="100" r="1.8"/><circle cx="690" cy="150" r="2.2"/><circle cx="728" cy="128" r="1.8"/></g><rect y="262" width="800" height="98" fill="#8A5A3B"/><ellipse cx="400" cy="306" rx="330" ry="42" fill="#C94F4F" opacity=".9"/><ellipse cx="400" cy="306" rx="290" ry="30" fill="none" stroke="#F2B233" stroke-width="3" stroke-dasharray="10 8"/><circle cx="120" cy="120" r="90" fill="#FFD447" opacity=".13"/><path d="M92 120h56l-11-40h-34z" fill="#FFD447"/><rect x="116" y="120" width="8" height="142" fill="#5A3A22"/><ellipse cx="120" cy="264" rx="30" ry="6" fill="#5A3A22"/>`;
    props.slice(0, 3).forEach((p, i) => (o += use(p, 210 + i * 70, 250, 60, 60)));
    o += use(pv[0] || 'grandpere', 230, 112, 170, 221);
    if (pv[1]) o += use(pv[1], 450, 190, 120, 156);
    if (pv[2]) o += use(pv[2], 570, 190, 120, 156);
    o += bubble(24, 14, 240);
  }
  return `<svg viewBox="0 0 800 360" role="img" aria-label="${esc(S.alt_fr || S.lieu || 'scène')}">${o}${flowers()}</svg>`;
}

/** Clés d'illustration qu'une scène peut utiliser (décors + personnages par défaut + objets). */
export function sceneKeys(spec: SceneSpec | undefined): string[] {
  const keys = new Set([
    'sun',
    'mosque',
    'palm',
    'stall',
    'flower',
    'airplane',
    'station',
    'youssouf',
    'maryam',
    'fatou',
    'papa',
    'maman',
    'grandpere',
  ]);
  for (const k of spec?.persos ?? []) keys.add(k);
  for (const k of spec?.props ?? []) keys.add(k);
  return [...keys];
}

/** Nom français d'un personnage de dialogue (`qui`) → clé d'illustration (sans normalisation Unicode). */
export function personaKey(qui: string): string {
  const map: Record<string, string> = {
    é: 'e',
    è: 'e',
    ê: 'e',
    ë: 'e',
    à: 'a',
    â: 'a',
    î: 'i',
    ï: 'i',
    ô: 'o',
    û: 'u',
    ù: 'u',
    ç: 'c',
  };
  return qui
    .toLowerCase()
    .replace(/[éèêëàâîïôûùç]/g, (c) => map[c] ?? c)
    .replace(/[^a-z]/g, '');
}
