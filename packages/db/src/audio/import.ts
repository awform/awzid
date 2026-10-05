/**
 * Import d'un muṣḥaf enregistré depuis un DOSSIER LOCAL (contenu du zip « ayat » : un fichier par verset).
 * Contrôles automatiques AVANT toute modification : nommage, versets manquants, en trop ou en double,
 * compte (Ḥafṣ : 6 236, compte koufi ; autres riwāyāt : compte DÉCLARÉ), fichiers lisibles et durées non
 * nulles, silences anormaux (WAV : calcul interne ; autres formats : ffmpeg s'il est installé), contenus
 * identiques, empreintes SHA-256 (comparées à une liste fournie le cas échéant). Un seul contrôle bloquant :
 * rien n'est copié, rien n'est activé ; le rapport est gardé (table quran_audio_import).
 * Fichiers copiés sous un nom qui porte leur empreinte (jamais écrasés) ; pistes remplacées d'un bloc.
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../client.js';
import * as t from '../schema.js';
import type { ReciterMeta } from './catalogue.js';
import { HAFS_SURA_VERSES, HAFS_TOTAL_VERSES, riwayaSuraVerses } from './suras.js';
import {
  ffmpegSilence,
  findFfmpeg,
  probeAudio,
  wavSilence,
  type AudioFormat,
  type SilenceInfo,
} from './probe.js';

export type IssueLevel = 'bloquant' | 'avertissement';

export interface AudioIssue {
  code: string;
  level: IssueLevel;
  file?: string;
  sura?: number;
  aya?: number;
  detail?: string;
}

export interface ScannedTrack {
  file: string;
  /** chemin complet du fichier source (lu, jamais modifié ni renommé) */
  source: string;
  sura: number;
  aya: number;
  format: AudioFormat;
  durationMs: number;
  bytes: number;
  sha256: string;
  silence: SilenceInfo | null;
}

export interface ScanOptions {
  dir: string;
  /** dossiers supplémentaires lus avec le premier (ex. une sourate livrée à part) ; jamais modifiés */
  extraDirs?: readonly string[];
  /**
   * nommage : S = chiffre de sourate, V = chiffre de verset (« SSSVVV.mp3 » ; une seule lettre : sans zéros).
   * Plusieurs nommages acceptés, séparés par des virgules (« 10-SSSVVV-A01.mp3,10-SSSVVV-001.mp3 ») : les
   * fichiers sont lus tels quels, jamais renommés.
   */
  pattern: string;
  riwaya: string;
  /** périmètre (muṣḥaf partiel) ; absent : muṣḥaf complet */
  suras?: readonly number[];
  /** compte déclaré (riwāyāt autres que Ḥafṣ) */
  declaredVerses?: number;
  /** empreintes fournies : nom de fichier → SHA-256 */
  checksums?: Map<string, string>;
  /** analyse des silences (défaut : oui) */
  silence?: boolean;
  /** ffmpeg : chemin ; null = ne pas l'utiliser ; absent = recherche automatique */
  ffmpeg?: string | null;
  /** plus long silence toléré sans avertissement (ms, défaut 4 000) */
  longSilenceMs?: number;
  concurrency?: number;
  /**
   * dossiers « par sourate » (zip du Complexe décompressé AVEC ses dossiers) : chaque sous-dossier « NNN … »
   * donne la sourate de ses fichiers (nom du dossier, pas nom du fichier) ; rien n'est renommé
   */
  suraFromFolder?: boolean;
  /**
   * fichiers de SOURATE ENTIÈRE (zip « sura ») : pour une riwāya autre que Ḥafṣ, une sourate dont le découpage
   * par verset n'est pas conforme au texte officiel est servie par son fichier de sourate (piste « verset 0 »)
   */
  suraFilesDir?: string;
  /** nommage des fichiers de sourate : S = chiffres de la sourate (ex. « 06-SSSD00-10mp3.mp3 ») */
  suraFilesPattern?: string;
  /** sourates servies par leur fichier entier sur DÉCISION du référent (toute riwāya, Ḥafṣ compris) */
  forceSuraFallback?: readonly number[];
}

export interface ScanReport {
  dir: string;
  pattern: string;
  riwaya: string;
  scope: 'complet' | 'partiel';
  suras: number[] | null;
  expected: number;
  found: number;
  totalBytes: number;
  totalMs: number;
  silenceBy: 'interne' | 'ffmpeg' | 'mixte' | 'aucune';
  blocking: number;
  warnings: number;
  /** nombre de constats par code */
  counts: Record<string, number>;
  issues: AudioIssue[];
  tracks: ScannedTrack[];
  /** sourates servies par leur fichier de sourate entière (repli) */
  suraFallback?: number[];
}

const pad3 = (n: number) => String(n).padStart(3, '0');

/** « SSSVVV.mp3 » → lecteur de noms de fichiers (null : nom hors nommage). */
export function compilePattern(
  pattern: string,
): (name: string) => { sura: number; aya: number } | null {
  const order: Array<'S' | 'V'> = [];
  let re = '';
  for (const m of pattern.matchAll(/S+|V+|[^SV]+/g)) {
    const tok = m[0];
    if (tok[0] === 'S' || tok[0] === 'V') {
      order.push(tok[0]);
      re += tok.length === 1 ? '(\\d{1,3})' : `(\\d{${tok.length}})`;
    } else re += tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  if (order.filter((x) => x === 'S').length !== 1 || order.filter((x) => x === 'V').length !== 1)
    throw new Error(`nommage « ${pattern} » : une suite de S et une suite de V attendues`);
  const rx = new RegExp(`^${re}$`, 'i');
  return (name) => {
    const m = rx.exec(name);
    if (!m) return null;
    const vals = order.map((_, i) => Number(m[i + 1]));
    return { sura: vals[order.indexOf('S')]!, aya: vals[order.indexOf('V')]! };
  };
}

/** Nommage d'un fichier de sourate entière (« 06-SSSD00-10mp3.mp3 ») → numéro de sourate (null : hors nommage). */
export function compileSuraPattern(pattern: string): (name: string) => number | null {
  let re = '';
  let n = 0;
  for (const m of pattern.matchAll(/S+|[^S]+/g)) {
    const tok = m[0];
    if (tok[0] === 'S') {
      n++;
      re += tok.length === 1 ? '(\\d{1,3})' : `(\\d{${tok.length}})`;
    } else re += tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  if (n !== 1) throw new Error(`nommage de sourate « ${pattern} » : une suite de S attendue`);
  const rx = new RegExp(`^${re}$`, 'i');
  return (name) => {
    const m = rx.exec(name);
    return m ? Number(m[1]) : null;
  };
}

/** Plusieurs nommages (séparés par des virgules) : le premier qui reconnaît le nom l'emporte. */
export function compilePatterns(
  patterns: string,
): (name: string) => { sura: number; aya: number } | null {
  const list = patterns
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map(compilePattern);
  if (list.length === 0) throw new Error('nommage vide');
  return (name) => {
    for (const p of list) {
      const v = p(name);
      if (v) return v;
    }
    return null;
  };
}

/**
 * Fichier annexe du Complexe (basmala « SSSC00 », isti'ādha « 000B00 », basmala de la Fātiḥa « 001B01 ») :
 * reconnu en remplaçant les chiffres du verset par B ou C suivi de chiffres ; ignoré (avertissement groupé).
 */
export function isAnnexName(patterns: string, name: string): boolean {
  return patterns
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .some((p) => {
      const re = p
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/S+/g, (m) => (m.length === 1 ? '\\d{1,3}' : `\\d{${m.length}}`))
        .replace(/V+/g, (m) => `[BC]\\d{${Math.max(1, m.length - 1)}}`);
      return new RegExp(`^${re}$`, 'i').test(name);
    });
}

/** Fichier SHA256SUMS (« empreinte  nom ») → table. */
export function readChecksums(file: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (m) out.set(m[2]!.split('/').pop()!, m[1]!.toLowerCase());
  }
  return out;
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

export async function scanAudioDir(o: ScanOptions): Promise<ScanReport> {
  const issues: AudioIssue[] = [];
  const add = (level: IssueLevel, code: string, x: Omit<AudioIssue, 'code' | 'level'> = {}) =>
    issues.push({ code, level, ...x });
  const parse = compilePatterns(o.pattern);
  const hafs = o.riwaya === 'hafs';
  // compte par sourate : Ḥafṣ, ou riwāya dont le compte officiel est connu (suras.ts) ; sinon compte déclaré
  const table = hafs ? HAFS_SURA_VERSES : riwayaSuraVerses(o.riwaya);
  const scope = o.suras ? new Set(o.suras) : null;
  const longSilence = o.longSilenceMs ?? 4000;
  const ffmpeg = o.silence === false ? null : o.ffmpeg === undefined ? findFfmpeg() : o.ffmpeg;

  // 1. noms → versets (doublons, hors nommage, hors muṣḥaf, hors périmètre), dans tous les dossiers
  const byVerse = new Map<string, { file: string; source: string; sura: number; aya: number }>();
  const addVerse = (file: string, source: string, v: { sura: number; aya: number }) => {
    // hors périmètre d'abord : une sourate écartée d'un import partiel ne bloque pas les autres
    if (scope && !scope.has(v.sura))
      return add('avertissement', 'hors_perimetre', { file, sura: v.sura, aya: v.aya });
    // autre riwāya au compte connu : un verset au-delà du compte officiel est jugé à l'étape 2 (basmala
    // d'al-Fātiḥa, repli sur le fichier de sourate) ; Ḥafṣ : refusé tout de suite
    const max = table && hafs ? (table[v.sura - 1] ?? 0) : 286;
    if (v.sura < 1 || v.sura > 114 || v.aya > max)
      return add('bloquant', 'hors_mushaf', { file, sura: v.sura, aya: v.aya });
    const key = `${v.sura}:${v.aya}`;
    const prev = byVerse.get(key);
    if (prev)
      return add('bloquant', 'doublon_nom', { file, sura: v.sura, aya: v.aya, detail: prev.file });
    byVerse.set(key, { file, source, ...v });
  };
  let annexes = 0;
  let folderMismatch = 0;
  for (const dir of [o.dir, ...(o.extraDirs ?? [])]) {
    if (!existsSync(dir)) {
      add('bloquant', 'dossier_absent', { detail: dir });
      continue;
    }
    const readFiles = (d: string, folderSura: number | null) => {
      for (const file of readdirSync(d).sort()) {
        const source = join(d, file);
        if (statSync(source).isDirectory()) {
          const m = /^(\d{3})(?:\D|$)/.exec(file);
          if (o.suraFromFolder && folderSura === null && m && +m[1]! >= 1 && +m[1]! <= 114)
            readFiles(source, +m[1]!);
          continue;
        }
        if (!statSync(source).isFile()) continue;
        const v = parse(file);
        if (v && folderSura !== null && v.sura !== folderSura) {
          folderMismatch++;
          v.sura = folderSura;
        }
        if (v) addVerse(file, source, v);
        else if (isAnnexName(o.pattern, file)) annexes++;
        else add('avertissement', 'nom_inattendu', { file });
      }
    };
    readFiles(dir, null);
  }
  if (folderMismatch)
    add('avertissement', 'sourate_du_dossier', {
      detail: `${folderMismatch} fichier(s) dont le nom porte une autre sourate que leur dossier : sourate du dossier retenue`,
    });
  if (annexes)
    add('avertissement', 'annexes_ignorees', {
      detail: `${annexes} fichier(s) basmala / isti'ādha (B/C) non importés`,
    });

  // 2. versets attendus
  const suras = o.suras ? [...o.suras] : Array.from({ length: 114 }, (_, i) => i + 1);
  let expected: number;
  const fallback = new Set<number>();
  if (table) {
    const ofSura = (s: number) =>
      [...byVerse.values()].filter((x) => x.sura === s && x.aya > 0).sort((a, b) => a.aya - b.aya);
    // a) al-Fātiḥa : riwāyāt où la basmala n'est pas un verset (toutes sauf le compte koufi : Ḥafṣ, Shuʿba) ;
    //    n + 1 fichiers numérotés 1..n+1 → le fichier 1 est la basmala (annexe), les suivants les versets 1..n
    const n1 = table[0]!;
    const f1 = ofSura(1);
    if (
      !hafs &&
      o.riwaya !== 'shuba' &&
      f1.length === n1 + 1 &&
      f1.every((x, i) => x.aya === i + 1)
    ) {
      for (const x of f1) byVerse.delete(`1:${x.aya}`);
      for (const x of f1.slice(1)) byVerse.set(`1:${x.aya - 1}`, { ...x, aya: x.aya - 1 });
      annexes++;
      add('avertissement', 'basmala_fatiha', {
        sura: 1,
        detail: `${f1[0]!.file} : basmala (annexe) ; fichiers 2 à ${n1 + 1} = versets 1 à ${n1}`,
      });
    }
    // b) découpage par verset non conforme au texte officiel → fichier de sourate entière, s'il est fourni
    const suraFiles = new Map<number, { file: string; source: string }>();
    if (o.suraFilesDir && o.suraFilesPattern && existsSync(o.suraFilesDir)) {
      const ps = compileSuraPattern(o.suraFilesPattern);
      for (const file of readdirSync(o.suraFilesDir)) {
        const s = ps(file);
        if (s && statSync(join(o.suraFilesDir, file)).isFile())
          suraFiles.set(s, { file, source: join(o.suraFilesDir, file) });
      }
    }
    for (const s of suras) {
      const f = ofSura(s);
      const n = table[s - 1]!;
      const forced = o.forceSuraFallback?.includes(s) ?? false;
      // Ḥafṣ : découpage par verset exigé, repli seulement sur décision expresse (--repli-sourates)
      if (hafs && !forced) continue;
      if (!forced && f.length === n && f.every((x, i) => x.aya === i + 1)) continue;
      const whole = suraFiles.get(s);
      if (whole) {
        for (const x of f) byVerse.delete(`${s}:${x.aya}`);
        byVerse.set(`${s}:0`, { ...whole, sura: s, aya: 0 });
        fallback.add(s);
        add('avertissement', 'repli_sourate', {
          sura: s,
          file: whole.file,
          detail: forced
            ? `décision du référent : fichier de sourate entière (${f.length} fichier(s) par verset écartés)`
            : `${f.length} fichier(s) par verset pour ${n} versets dans le texte officiel : fichier de sourate entière`,
        });
      } else
        for (const x of f)
          if (x.aya > n) add('bloquant', 'hors_mushaf', { file: x.file, sura: s, aya: x.aya });
    }
  }
  if (table) {
    expected = suras.reduce((n, s) => n + table[s - 1]!, 0);
    if (hafs && !o.suras && expected !== HAFS_TOTAL_VERSES)
      throw new Error('table des sourates incohérente');
    if (!hafs && o.declaredVerses !== undefined && o.declaredVerses !== expected)
      add('bloquant', 'compte_incorrect', {
        detail: `compte déclaré ${o.declaredVerses}, compte officiel de la riwāya ${expected}`,
      });
    for (const s of suras.filter((x) => !fallback.has(x)))
      for (let a = 1; a <= table[s - 1]!; a++)
        if (!byVerse.has(`${s}:${a}`))
          add('bloquant', 'manquant', { sura: s, aya: a, detail: `${pad3(s)}${pad3(a)}` });
  } else {
    expected = o.declaredVerses ?? 0;
    if (!o.declaredVerses)
      add('bloquant', 'compte_non_declare', {
        detail: `riwāya ${o.riwaya} : nombre de versets à déclarer (--versets)`,
      });
    // numérotation propre à la riwāya : chaque sourate présente doit aller de 1 à son dernier verset
    for (const s of suras) {
      const ayas = [...byVerse.values()].filter((x) => x.sura === s && x.aya > 0).map((x) => x.aya);
      if (ayas.length === 0) {
        add('bloquant', 'sourate_absente', { sura: s });
        continue;
      }
      const last = Math.max(...ayas);
      for (let a = 1; a <= last; a++)
        if (!byVerse.has(`${s}:${a}`))
          add('bloquant', 'manquant', { sura: s, aya: a, detail: `${pad3(s)}${pad3(a)}` });
    }
  }
  // versets couverts : un par fichier de verset, plus ceux des sourates servies en entier
  const counted =
    [...byVerse.values()].filter((x) => x.aya > 0).length +
    [...fallback].reduce((n, s) => n + (table?.[s - 1] ?? 0), 0);
  if (expected && counted !== expected)
    add('bloquant', 'compte_incorrect', {
      detail: `${counted} versets trouvés, ${expected} attendus`,
    });
  const zeros = [...byVerse.values()].filter((x) => x.aya === 0 && !fallback.has(x.sura)).length;
  if (zeros)
    add('avertissement', 'verset_zero', { detail: `${zeros} fichier(s) « 000 » gardés à part` });

  // 3. fichiers : lecture, durée, empreinte, silences
  const entries = [...byVerse.values()].sort((a, b) => a.sura - b.sura || a.aya - b.aya);
  let unchecked = 0;
  const methods = new Set<string>();
  const scanned = await pool(entries, o.concurrency ?? 4, async (e) => {
    const path = e.source;
    const buf = readFileSync(path);
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const p = probeAudio(buf);
    if (!p) {
      add('bloquant', 'illisible', { file: e.file, sura: e.sura, aya: e.aya });
      return null;
    }
    if (p.durationMs <= 0)
      add('bloquant', 'duree_nulle', { file: e.file, sura: e.sura, aya: e.aya });
    else if (p.durationMs < 300 || p.durationMs > 15 * 60_000)
      add('avertissement', 'duree_suspecte', { file: e.file, detail: `${p.durationMs} ms` });
    if (p.junkBytes > 0)
      add('avertissement', 'octets_parasites', { file: e.file, detail: `${p.junkBytes} octets` });
    let silence: SilenceInfo | null = null;
    if (o.silence !== false && p.durationMs > 0) {
      silence = p.format === 'wav' ? wavSilence(buf) : null;
      if (!silence && ffmpeg) silence = await ffmpegSilence(ffmpeg, path, p.durationMs);
      if (!silence) unchecked++;
      else {
        methods.add(silence.by);
        if (silence.totalMs >= p.durationMs * 0.95)
          add('bloquant', 'silence_total', { file: e.file, sura: e.sura, aya: e.aya });
        else if (silence.longestMs >= longSilence)
          add('avertissement', 'silence_long', {
            file: e.file,
            sura: e.sura,
            aya: e.aya,
            detail: `${silence.longestMs} ms`,
          });
      }
    }
    if (o.checksums) {
      const want = o.checksums.get(e.file);
      if (!want) add('avertissement', 'empreinte_absente', { file: e.file });
      else if (want !== sha256)
        add('bloquant', 'empreinte_differente', { file: e.file, detail: want });
    }
    const track: ScannedTrack = {
      file: e.file,
      source: e.source,
      sura: e.sura,
      aya: e.aya,
      format: p.format,
      durationMs: p.durationMs,
      bytes: buf.length,
      sha256,
      silence,
    };
    return track;
  });
  const tracks = scanned.filter((x): x is ScannedTrack => x !== null);
  if (o.silence === false)
    add('avertissement', 'silences_non_verifies', { detail: 'analyse désactivée' });
  else if (unchecked)
    add('avertissement', 'silences_non_verifies', {
      detail: `${unchecked} fichier(s) : ffmpeg absent ou en échec`,
    });
  const seen = new Map<string, string>();
  for (const tr of tracks) {
    const prev = seen.get(tr.sha256);
    if (prev) add('bloquant', 'doublon_contenu', { file: tr.file, detail: prev });
    else seen.set(tr.sha256, tr.file);
  }

  const counts: Record<string, number> = {};
  for (const i of issues) counts[i.code] = (counts[i.code] ?? 0) + 1;
  return {
    dir: o.dir,
    pattern: o.pattern,
    riwaya: o.riwaya,
    scope: o.suras ? 'partiel' : 'complet',
    suras: o.suras ? [...o.suras] : null,
    expected,
    found: counted,
    totalBytes: tracks.reduce((n, x) => n + x.bytes, 0),
    totalMs: tracks.reduce((n, x) => n + x.durationMs, 0),
    silenceBy:
      methods.size === 0 ? 'aucune' : methods.size === 2 ? 'mixte' : ([...methods][0] as 'interne'),
    blocking: issues.filter((i) => i.level === 'bloquant').length,
    warnings: issues.filter((i) => i.level === 'avertissement').length,
    counts,
    issues,
    tracks,
    ...(fallback.size ? { suraFallback: [...fallback].sort((a, b) => a - b) } : {}),
  };
}

/** Récitateur : métadonnées posées ou mises à jour (le statut n'est jamais changé ici). */
export async function upsertReciter(db: Db, m: ReciterMeta): Promise<void> {
  const v = {
    nameAr: m.nameAr,
    nameFr: m.nameFr,
    riwaya: m.riwaya,
    speed: m.speed,
    style: m.style,
    expectedVerses: m.expectedVerses,
    licenseSource: m.licenseSource,
    licenseUrl: m.licenseUrl,
    licenseArchivedOn: m.licenseArchivedOn,
    licenseText: m.licenseText,
    credit: m.credit,
    creditAr: m.creditAr,
    usageNote: m.usageNote,
  };
  await db
    .insert(t.quranReciter)
    .values({ id: m.id, ...v })
    .onConflictDoUpdate({ target: t.quranReciter.id, set: v });
}

export interface ImportAudioOptions extends Omit<ScanOptions, 'riwaya'> {
  reciterId: string;
  /** stockage audio (AWFORM_AUDIO_DIR) */
  storageDir: string;
  activate?: boolean;
  /** activer un muṣḥaf partiel (essais) */
  partialOk?: boolean;
  /** réactiver un récitateur retiré */
  reactivate?: boolean;
}

export interface ImportAudioResult {
  importId: string;
  status: 'bloque' | 'importe' | 'active';
  report: ScanReport;
}

/** Rapport gardé en base : sans la liste des pistes, 500 constats au plus (les comptes sont complets). */
function storedReport(r: ScanReport) {
  const copy: Partial<ScanReport> = { ...r, issues: r.issues.slice(0, 500) };
  delete copy.tracks;
  return { ...copy, issuesTruncated: r.issues.length > 500 };
}

export async function importReciterAudio(
  db: Db,
  o: ImportAudioOptions,
): Promise<ImportAudioResult> {
  const startedAt = new Date();
  const [rec] = await db.select().from(t.quranReciter).where(eq(t.quranReciter.id, o.reciterId));
  if (!rec) throw new Error(`récitateur inconnu : ${o.reciterId} (catalogue à poser d'abord)`);
  const report = await scanAudioDir({
    ...o,
    riwaya: rec.riwaya,
    declaredVerses:
      o.declaredVerses ?? (rec.riwaya !== 'hafs' && !o.suras ? rec.expectedVerses : undefined),
  });
  const block = (code: string, detail: string) => {
    report.issues.push({ code, level: 'bloquant', detail });
    report.blocking++;
    report.counts[code] = (report.counts[code] ?? 0) + 1;
  };
  if (o.activate && o.suras && !o.partialOk)
    block(
      'mushaf_incomplet',
      'activation d’un muṣḥaf partiel refusée (option --partiel pour un essai)',
    );
  if (o.activate && rec.status === 'retire' && !o.reactivate)
    block('recitateur_retire', `retiré le ${rec.retiredAt?.toISOString()} : ${rec.retiredReason}`);

  const base = {
    reciterId: rec.id,
    sourceDir: [o.dir, ...(o.extraDirs ?? [])].join(' + '),
    pattern: o.pattern,
    tracks: report.tracks.length,
    totalBytes: report.totalBytes,
    totalMs: report.totalMs,
    blocking: report.blocking,
    warnings: report.warnings,
    report: storedReport(report),
    startedAt,
  };
  if (report.blocking > 0) {
    const [row] = await db
      .insert(t.quranAudioImport)
      .values({ ...base, status: 'bloque' })
      .returning({ id: t.quranAudioImport.id });
    return { importId: row!.id, status: 'bloque', report };
  }

  // copie : nom porteur de l'empreinte, écriture atomique (fichier temporaire puis renommage)
  const dirRel = rec.id;
  mkdirSync(join(o.storageDir, dirRel), { recursive: true });
  const rows = report.tracks.map((tr) => {
    const path = `${dirRel}/${pad3(tr.sura)}${pad3(tr.aya)}-${tr.sha256.slice(0, 16)}.${tr.format}`;
    const dest = join(o.storageDir, path);
    if (!existsSync(dest) || statSync(dest).size !== tr.bytes) {
      copyFileSync(tr.source, `${dest}.part`);
      renameSync(`${dest}.part`, dest);
    }
    return {
      reciterId: rec.id,
      sura: tr.sura,
      aya: tr.aya,
      path,
      durationMs: tr.durationMs,
      bytes: tr.bytes,
      sha256: tr.sha256,
      format: tr.format,
    };
  });
  const status = o.activate ? 'active' : 'importe';
  const importId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(t.quranAudioImport)
      .values({ ...base, status })
      .returning({ id: t.quranAudioImport.id });
    const where = o.suras
      ? and(eq(t.quranTrack.reciterId, rec.id), inArray(t.quranTrack.sura, [...o.suras]))
      : eq(t.quranTrack.reciterId, rec.id);
    await tx.delete(t.quranTrack).where(where);
    for (let i = 0; i < rows.length; i += 500)
      await tx
        .insert(t.quranTrack)
        .values(rows.slice(i, i + 500).map((r) => ({ ...r, importId: row!.id })));
    if (o.activate)
      await tx
        .update(t.quranReciter)
        .set({ status: 'actif', activatedAt: new Date(), retiredAt: null, retiredReason: null })
        .where(eq(t.quranReciter.id, rec.id));
    return row!.id;
  });
  return { importId, status, report };
}

/**
 * Retrait immédiat (coupure) : le récitateur disparaît des réponses, des paquets et des fichiers servis.
 * Journalisé. Renvoie false si le récitateur est inconnu.
 */
export async function retireReciter(
  db: Db,
  id: string,
  reason: string,
  actorAccountId: string | null = null,
): Promise<boolean> {
  if (!reason.trim()) throw new Error('motif du retrait obligatoire');
  const r = await db
    .update(t.quranReciter)
    .set({ status: 'retire', retiredAt: new Date(), retiredReason: reason.trim() })
    .where(eq(t.quranReciter.id, id))
    .returning({ id: t.quranReciter.id });
  if (!r[0]) return false;
  await db.insert(t.auditLog).values({
    actorAccountId,
    action: 'coran_audio_retrait',
    target: id,
    after: { motif: reason.trim() },
  });
  return true;
}

/** Résumé lisible (français) d'un rapport d'import. */
export function formatReport(r: ScanReport, status?: string): string {
  const lines = [
    `Dossier : ${r.dir} (nommage ${r.pattern}, riwāya ${r.riwaya}, ${r.scope === 'complet' ? 'muṣḥaf complet' : `sourates ${r.suras?.join(', ')}`})`,
    `Versets : ${r.found} trouvés / ${r.expected} attendus ; ${r.tracks.length} fichier(s) lus, ` +
      `${(r.totalBytes / 1048576).toFixed(1)} Mo, ${(r.totalMs / 3_600_000).toFixed(2)} h`,
    `Silences analysés : ${r.silenceBy}`,
    `Contrôles : ${r.blocking} bloquant(s), ${r.warnings} avertissement(s)`,
  ];
  for (const [code, n] of Object.entries(r.counts).sort()) lines.push(`  - ${code} : ${n}`);
  for (const i of r.issues.filter((x) => x.level === 'bloquant').slice(0, 20))
    lines.push(
      `  ! ${i.code} ${i.file ?? ''} ${i.sura ? `${i.sura}:${i.aya ?? ''}` : ''} ${i.detail ?? ''}`.trimEnd(),
    );
  if (status)
    lines.push(
      status === 'bloque'
        ? 'RÉSULTAT : BLOQUÉ — rien n’a été copié ni activé.'
        : status === 'active'
          ? 'RÉSULTAT : importé et ACTIVÉ.'
          : 'RÉSULTAT : importé, NON activé (relancer avec --activer après écoute).',
    );
  return lines.join('\n');
}
