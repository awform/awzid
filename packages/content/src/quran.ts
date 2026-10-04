/**
 * Contrôle du texte coranique : chaque verset des leçons est comparé OCTET PAR OCTET (égalité stricte
 * de chaînes, sans aucune normalisation) au texte Tanzil « quran-uthmani » (coran/tanzil-uthmani.tsv).
 * Seuls les crochets de couleur `[..]` sont retirés avant comparaison (ils sont ajoutés par les livres).
 * Règles reprises de awform/fix-versets.ps1 (basmala retirée du verset 1, séparateur « ۝ ») et de
 * ECARTS_VERSETS.md (extraits exacts, écarts voulus en liste blanche).
 */
import { plain } from './text.js';

export type Tanzil = ReadonlyMap<string, string>;

/** Charge le TSV Tanzil (`s:v<TAB>texte`, fins de ligne CRLF ou LF). Retire seulement le BOM et le CR. */
export function loadTanzil(tsv: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of tsv.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const key = line
      .slice(0, tab)
      .replace(/^\uFEFF/, '')
      .trim();
    const text = line.slice(tab + 1).replace(/^\uFEFF/, '');
    map.set(key, text);
  }
  return map;
}

export interface VerseRange {
  sura: number;
  from: number;
  to: number;
}

/** Références d'un `ref_fr` : « Al-Fātiḥa 1:1 », « 114:1-3 », « 65:2 (fin) et 65:3 », « 88:24 ; 87:1 », « 2:285-2:286 ». */
export function parseRefs(ref: string): VerseRange[] {
  const out: VerseRange[] = [];
  const re = /(\d{1,3})\s*:\s*(\d{1,3})(?:\s*[-–]\s*(?:(\d{1,3})\s*:\s*)?(\d{1,3}))?/g;
  for (let m = re.exec(ref); m; m = re.exec(ref)) {
    const sura = Number(m[1]);
    const from = Number(m[2]);
    const toSura = m[3] ? Number(m[3]) : sura;
    const to = m[4] ? Number(m[4]) : from;
    if (toSura !== sura) {
      out.push({ sura, from, to: from });
      out.push({ sura: toSura, from: to, to });
    } else out.push({ sura, from, to: Math.max(from, to) });
  }
  return out;
}

const CHADDA = /ّ/g;

/** Textes acceptables pour un verset : texte Tanzil, et sans la basmala pour un verset 1 (hors 1 et 9). */
export function ayahCandidates(tanzil: Tanzil, sura: number, aya: number): string[] {
  const text = tanzil.get(`${sura}:${aya}`);
  if (text === undefined) return [];
  const out = [text];
  if (aya === 1 && sura !== 1 && sura !== 9) {
    const bism = tanzil.get('1:1');
    const words = text.split(' ');
    if (
      bism &&
      words.length > 4 &&
      words.slice(0, 4).join(' ').replace(CHADDA, '') === bism.replace(CHADDA, '')
    ) {
      out.push(words.slice(4).join(' '));
    }
  }
  return out;
}

export type VerseStatus =
  'identique' | 'extrait' | 'ecart' | 'reference_absente' | 'reference_inconnue';

export interface VerseCheck {
  status: VerseStatus;
  detail?: string;
}

const SEPARATOR = '۝';

/** Compare un verset de leçon (crochets retirés) au texte Tanzil des références données. */
export function checkVerse(ar: string, ref: string | undefined, tanzil: Tanzil): VerseCheck {
  const ranges = parseRefs(ref ?? '');
  if (ranges.length === 0)
    return { status: 'reference_absente', detail: `référence illisible : « ${ref ?? ''} »` };
  const perAyah: string[][] = [];
  for (const r of ranges) {
    for (let a = r.from; a <= r.to; a++) {
      const c = ayahCandidates(tanzil, r.sura, a);
      if (c.length === 0)
        return { status: 'reference_inconnue', detail: `${r.sura}:${a} absent de Tanzil` };
      perAyah.push(c);
    }
  }
  const text = plain(ar);
  const firsts = perAyah.map((c) => c[c.length - 1] ?? '');
  const fulls = perAyah.map((c) => c[0] ?? '');
  const joined = new Set<string>();
  for (const parts of [fulls, firsts]) {
    joined.add(parts.join(` ${SEPARATOR} `));
    joined.add(parts.join(' '));
  }
  if (joined.has(text)) return { status: 'identique' };

  const segments = text.split(SEPARATOR).map((s) => s.trim());
  const all = perAyah.flat();
  let extract = false;
  for (const seg of segments) {
    if (!seg) return { status: 'ecart', detail: 'segment vide autour du séparateur ۝' };
    if (all.includes(seg)) continue;
    if (all.some((c) => c.includes(seg))) {
      extract = true;
      continue;
    }
    return { status: 'ecart', detail: `segment absent du texte Tanzil : « ${seg.slice(0, 40)}… »` };
  }
  return extract ? { status: 'extrait' } : { status: 'identique' };
}

/** Clé de la liste blanche : `<niveau>.<lNN>|<première référence s:v>` */
export function whitelistKey(level: string, lesson: string, ref: string): string {
  const r = parseRefs(ref)[0];
  return `${level}.${lesson}|${r ? `${r.sura}:${r.from}` : ref.trim()}`;
}

/** Liste blanche des écarts VOULUS, lue dans le tableau de awform/ECARTS_VERSETS.md (lignes « VOULU »). */
export function parseEcartsVoulus(markdown: string): Set<string> {
  const set = new Set<string>();
  for (const line of markdown.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    // | Livre | Leçon | Référence | Écart | Décision | Justification |
    if (cells.length < 7) continue;
    const [, level, lesson, ref, , decision] = cells;
    if (!level || !lesson || !ref || !decision) continue;
    if (!/^[a-z]+\d+$/.test(level) || !/^l\d\d$/.test(lesson)) continue;
    if (!decision.startsWith('VOULU')) continue;
    set.add(whitelistKey(level, lesson, ref));
  }
  return set;
}

/*
 * Lecture du Coran (série « qc », lot 28) : chaque objet du livret porte `src` = « Q:s:v[-v2][:w[-w2]][|…] »
 * (verset, plage de versets ou mots w..w2 du verset ; après « | » : consignes d'affichage du moteur) et `ar`,
 * le texte affiché avec ses crochets de couleur (`[..]`, `[g:..]`, `[m4:..]`…). Règle de awform/qc-check.ps1
 * (E2) : `ar` sans crochets = extrait de Tanzil, OCTET PAR OCTET (versets d'une plage séparés par « ۝ »,
 * basmala retirée d'un verset 1 hors sourates 1 et 9).
 */
const QC_SRC = /^Q:(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?(?::(\d{1,3})(?:-(\d{1,3}))?)?(?:\||$)/;

/** Texte Tanzil désigné par un `src` de la série qc (null : forme illisible ou hors du texte). */
export function qcSourceText(src: string, tanzil: Tanzil): string | null {
  const m = QC_SRC.exec(src);
  if (!m) return null;
  const sura = Number(m[1]);
  const aya = Number(m[2]);
  if (m[4]) {
    if (m[3]) return null;
    const text = tanzil.get(`${sura}:${aya}`);
    if (text === undefined) return null;
    const words = text.split(' ');
    const a = Number(m[4]);
    const b = m[5] ? Number(m[5]) : a;
    if (a < 1 || b < a || b > words.length) return null;
    return words.slice(a - 1, b).join(' ');
  }
  const to = m[3] ? Number(m[3]) : aya;
  if (to < aya) return null;
  const out: string[] = [];
  for (let k = aya; k <= to; k++) {
    const c = ayahCandidates(tanzil, sura, k);
    if (c.length === 0) return null;
    out.push(c[c.length - 1]!);
  }
  return out.join(` ${SEPARATOR} `);
}

/** Retire les crochets de couleur des livrets qc (`[`, `[g:`, `[m4:`… et `]`) ; rien d'autre n'est touché. */
export function stripQcMarks(ar: string): string {
  return ar.replace(/\[(?:[gmqtxw]\d?:)?/g, '').replace(/\]/g, '');
}

/** Contrôle d'un extrait de livret qc : « identique » (verset entier), « extrait » (mots w..w2) ou écart. */
export function checkQcSource(ar: string, src: string, tanzil: Tanzil): VerseCheck {
  const expected = qcSourceText(src, tanzil);
  if (expected === null)
    return {
      status: 'reference_inconnue',
      detail: `source « ${src} » illisible ou absente de Tanzil`,
    };
  const text = stripQcMarks(ar);
  if (text !== expected)
    return {
      status: 'ecart',
      detail: `texte ≠ Tanzil (« ${text.slice(0, 40)}… » au lieu de « ${expected.slice(0, 40)}… »)`,
    };
  return { status: /^Q:\d+:\d+:\d/.test(src) ? 'extrait' : 'identique' };
}

/** Objets `{ src: "Q:…", ar }` d'une unité (chemin JSON compris), où qu'ils soient. */
export function qcQuranSources(
  value: unknown,
  path = '',
): Array<{ path: string; src: string; ar: unknown }> {
  const out: Array<{ path: string; src: string; ar: unknown }> = [];
  if (Array.isArray(value))
    value.forEach((v, i) => out.push(...qcQuranSources(v, `${path}[${i}]`)));
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.src === 'string' && o.src.startsWith('Q:'))
      out.push({ path: path || '$', src: o.src, ar: o.ar });
    for (const [k, v] of Object.entries(o))
      if (v && typeof v === 'object') out.push(...qcQuranSources(v, path ? `${path}.${k}` : k));
  }
  return out;
}
