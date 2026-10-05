/**
 * Chaîne d'import (cahier des charges §5.3), étapes 1 à 4 pour le MVP :
 * lecture des fichiers (JSON strict / bac à sable) → modèle typé → contrôles (Coran octet par octet,
 * corrigés des 8 types « langue », champs obligatoires, index des leçons) → empreintes et identifiants.
 * Aucune écriture dans le dossier source : les livres restent la source de vérité.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { contentHash, sha256Hex } from './canonical.js';
import { parseDataFile } from './parse.js';
import {
  checkQcSource,
  checkVerse,
  loadTanzil,
  parseEcartsVoulus,
  qcQuranSources,
  whitelistKey,
  type Tanzil,
} from './quran.js';
import { checkQuranData, parseQuranData, type QuranDivisions } from './qurandata.js';
import { ROOT_ITEMS, verifyRootItems } from './roots.js';
import { plain } from './text.js';
import { checkUnit, translitWords } from './checks.js';
import { loadIllustrations, type Illustration } from './illus.js';
import {
  LANGUAGE_EXERCISE_TYPES,
  NOSCORE_TYPES,
  type Book,
  type Exercise,
  type HifzBook,
  type ImportedExercise,
  type ImportedLevel,
  type ImportedUnit,
  type Issue,
  type Lesson,
  type LessonIndexEntry,
  type UnitKind,
} from './types.js';

export interface VerseStats {
  total: number;
  identique: number;
  extrait: number;
  voulu: number;
  erreurs: number;
}

export interface RegistryData {
  coran: Record<string, Record<string, unknown>>;
  hadiths: Record<string, Record<string, unknown>>;
  fiqh: Record<string, Record<string, unknown>>;
}

export interface EditionLoad {
  contentDir: string;
  /** SHA-256 du manifeste de la copie (MANIFEST.sha256) ou, à défaut, des fichiers lus */
  sourceSha256: string;
  levels: ImportedLevel[];
  lessonIndex: Record<string, LessonIndexEntry>;
  hifz: HifzBook[];
  hifzShared: Record<string, unknown>;
  registry: RegistryData | null;
  /** livrets gradués (bibliothèque) et leur catalogue */
  booklets: Booklet[];
  catalogue: Array<Record<string, unknown>>;
  /** illustrations retenues (clé → SVG validé) ; null si non chargées */
  illustrations: Map<string, Illustration> | null;
  tanzil: Tanzil;
  /** métadonnées officielles Tanzil (ajzāʾ, quarts de ḥizb, pages de Médine) ; null si absentes */
  quranData: QuranDivisions | null;
  /** documents d'évaluation des livres (data/eval : certificats, référentiel, règles) ; clés absentes si non copiés */
  evalDocs: Record<string, unknown>;
  verseStats: VerseStats;
  /**
   * Lignée des exercices (lot F1, E5) : ancien identifiant → identifiant actuel. Contient les entrées des
   * tables de gel où l'identifiant a changé (nature « gel ») et celles de `ids/lignee.json` (remplacement,
   * fusion, scission, retrait), contrôlées contre les livres.
   */
  lineage: LineageEntry[];
  issues: Issue[];
}

export const LINEAGE_KINDS = ['gel', 'remplace', 'fusion', 'scission', 'retire'] as const;
export type LineageKind = (typeof LINEAGE_KINDS)[number];
export interface LineageEntry {
  from: string;
  /** null : exercice retiré (ses réponses ne comptent plus) */
  to: string | null;
  kind: LineageKind;
  note: string | null;
}

export interface Booklet {
  code: string;
  level: string;
  content: Record<string, unknown>;
}

export interface LoadOptions {
  contentDir: string;
  levels: string[];
  /** charger aussi le registre (coran, hadiths, fiqh) — par défaut oui */
  withRegistry?: boolean;
  /** charger et contrôler les illustrations (dossier illus/) — par défaut oui */
  withIllustrations?: boolean;
  /** charger la bibliothèque des livrets (data/lect) — par défaut oui */
  withBooklets?: boolean;
  /**
   * carnets de hifẓ publiés (codes de niveaux, lot 28) : seuls les carnets audités et gelés ; un carnet n'est
   * chargé qu'avec son livre. Par défaut : le carnet de chaque niveau chargé.
   */
  hifzLevels?: string[];
}

const UNIT_FILE = /^l\d\d\.js$/;
const KINDS: ReadonlySet<string> = new Set(['lecon', 'bilan', 'examen']);

export function isGradedType(type: string): boolean {
  return !NOSCORE_TYPES.includes(type);
}

export function itemCount(ex: Exercise): number {
  const e = ex as Record<string, unknown>;
  if (ex.type === 'chasse') return Array.isArray(e.grille) ? e.grille.length : 0;
  if (ex.type === 'contient') return Array.isArray(e.mots) ? e.mots.length : 0;
  return Array.isArray(e.items) ? e.items.length : 0;
}

/** Contrôles des corrigés des 8 types « langue » (portage de controle-corriges.ps1 / règles SCHEMA.md). */
export function checkLanguageExercise(ex: Exercise): string[] {
  const problems: string[] = [];
  const e = ex as unknown as Record<string, unknown>;
  const items = (Array.isArray(e.items) ? e.items : []) as Array<Record<string, unknown>>;
  const opts = (it: Record<string, unknown>) =>
    (Array.isArray(it.options) ? it.options : []).map((o) => String(o));
  switch (ex.type) {
    case 'premiere_lettre':
      items.forEach((it, i) => {
        if (!opts(it).includes(String(it.reponse)))
          problems.push(`item ${i + 1} : reponse absente des options`);
      });
      break;
    case 'ecoute':
      items.forEach((it, i) => {
        const a = plain(it.reponse ?? it.dit);
        if (!opts(it).some((o) => plain(o) === a))
          problems.push(`item ${i + 1} : ${it.reponse ? 'reponse' : 'dit'} absent des options`);
      });
      break;
    case 'complete':
      items.forEach((it, i) => {
        if (!opts(it).some((o) => plain(o) === plain(it.reponse)))
          problems.push(`item ${i + 1} : reponse absente des options`);
      });
      break;
    case 'ordre':
      items.forEach((it, i) => {
        const phrase = plain(it.phrase).trim();
        const sep = phrase.includes(' ') ? ' ' : '';
        const mots = (Array.isArray(it.mots) ? it.mots : []).map((m) => plain(m));
        // la phrase doit être la concaténation exacte des étiquettes (dans un certain ordre)
        if (!canJoin(phrase, mots, sep))
          problems.push(`item ${i + 1} : phrase ≠ concaténation des étiquettes`);
      });
      break;
    case 'chasse':
      if (!Array.isArray(e.grille) || e.grille.length === 0) problems.push('grille vide');
      break;
    case 'contient':
      if (!Array.isArray(e.mots) || !(e.mots as Array<{ oui?: boolean }>).some((m) => m.oui))
        problems.push('aucun mot « oui »');
      break;
    case 'relier':
      if (items.length < 2) problems.push('moins de 2 paires');
      break;
    case 'vrai_faux':
      items.forEach((it, i) => {
        if (typeof it.vrai !== 'boolean') problems.push(`item ${i + 1} : champ vrai non booléen`);
      });
      break;
  }
  return problems;
}

/** `target` s'écrit-il comme toutes les étiquettes jointes par `sep`, dans un ordre quelconque ? */
export function canJoin(target: string, parts: readonly string[], sep: string): boolean {
  if (parts.length === 0) return target.length === 0;
  if (parts.length === 1) return target === parts[0];
  const tried = new Set<string>();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i] ?? '';
    if (tried.has(p)) continue;
    tried.add(p);
    const head = p + sep;
    if (
      target.startsWith(head) &&
      canJoin(
        target.slice(head.length),
        parts.filter((_, j) => j !== i),
        sep,
      )
    )
      return true;
  }
  return false;
}

function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Identifiant explicite d'exercice : `<niveau>.l<NN>.ex<k>` (ou un suffixe stable après le point). */
export const EXERCISE_ID = /^[a-z]{2,3}\d{1,2}\.l\d{2}\.[a-z0-9_-]{1,40}$/;

/**
 * Tables `ids/*-correspondance.json` (champ `correspondance` : ancien identifiant → nouvel id). Absentes :
 * null (les livres non gelés gardent l'identifiant de position).
 */
export function loadIdMaps(dir: string, issues: Issue[]): Map<string, string> | null {
  if (!existsSync(dir)) return null;
  const map = new Map<string, string>();
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith('-correspondance.json'))
    .sort()) {
    try {
      const j = JSON.parse(readText(join(dir, f)).replace(/^\uFEFF/, '')) as {
        correspondance?: Record<string, string>;
      };
      for (const [k, v] of Object.entries(j.correspondance ?? {})) map.set(k, v);
    } catch (e) {
      issues.push({
        severity: 'erreur',
        code: 'ids_illisible',
        file: `ids/${f}`,
        message: `table de correspondance illisible : ${(e as Error).message}`,
      });
    }
  }
  return map.size ? map : null;
}

/** Niveaux GELÉS (présents dans une table de correspondance) : un exercice sans « id » y est refusé. */
export function frozenLevels(map: Map<string, string> | null): Set<string> {
  return new Set([...(map?.keys() ?? [])].map((k) => k.split('.')[0] ?? ''));
}

/**
 * `ids/lignee.json` (facultatif, exporté par les livres quand un exercice gelé est remplacé, fusionné, scindé
 * ou retiré) : `{ "lignee": [{ "de": "ad2.l03.ex4", "vers": "ad2.l03.ex9" | null, "nature": "remplace",
 * "motif": "…" }] }`. Les réponses suivent la lignée ; elles ne comptent que si le CORRIGÉ est resté le même.
 */
export function loadLineage(dir: string, issues: Issue[]): LineageEntry[] {
  const f = join(dir, 'lignee.json');
  if (!existsSync(f)) return [];
  try {
    const j = JSON.parse(readText(f).replace(/^\uFEFF/, '')) as {
      lignee?: Array<{ de?: unknown; vers?: unknown; nature?: unknown; motif?: unknown }>;
    };
    const out: LineageEntry[] = [];
    for (const e of j.lignee ?? []) {
      const kind = String(e.nature ?? '') as LineageKind;
      const okTo = e.vers === null || (typeof e.vers === 'string' && EXERCISE_ID.test(e.vers));
      if (
        typeof e.de !== 'string' ||
        !EXERCISE_ID.test(e.de) ||
        !okTo ||
        !LINEAGE_KINDS.includes(kind) ||
        (kind === 'retire') !== (e.vers === null)
      ) {
        issues.push({
          severity: 'erreur',
          code: 'lignee_invalide',
          file: 'ids/lignee.json',
          message: `entrée de lignée invalide : ${JSON.stringify(e).slice(0, 160)}`,
        });
        continue;
      }
      out.push({
        from: e.de,
        to: (e.vers as string | null) ?? null,
        kind,
        note: typeof e.motif === 'string' ? e.motif.slice(0, 300) : null,
      });
    }
    return out;
  } catch (e) {
    issues.push({
      severity: 'erreur',
      code: 'lignee_illisible',
      file: 'ids/lignee.json',
      message: `lignée illisible : ${(e as Error).message}`,
    });
    return [];
  }
}

export function loadEdition(opts: LoadOptions): EditionLoad {
  const { contentDir } = opts;
  const issues: Issue[] = [];
  const dataDir = join(contentDir, 'data');

  // Tanzil + liste blanche des écarts voulus
  const tanzil = loadTanzil(readText(join(contentDir, 'coran', 'tanzil-uthmani.tsv')));
  if (tanzil.size !== 6236)
    issues.push({
      severity: 'erreur',
      code: 'tanzil_incomplet',
      message: `${tanzil.size} versets au lieu de 6 236`,
    });
  // métadonnées officielles (facultatives) : empreinte et invariants contrôlés, sinon erreur bloquante
  let quranData: QuranDivisions | null = null;
  const qdPath = join(contentDir, 'coran', 'tanzil-quran-data.js');
  if (existsSync(qdPath)) {
    const src = readText(qdPath);
    try {
      const d = parseQuranData(src);
      const chk = checkQuranData(src, d);
      if (chk.ok) quranData = d;
      else
        issues.push({
          severity: 'erreur',
          code: 'metadonnees_coran',
          message: chk.errors.join(' ; '),
        });
    } catch (e) {
      issues.push({ severity: 'erreur', code: 'metadonnees_coran', message: String(e) });
    }
  }
  const ecartsPath = join(contentDir, 'ECARTS_VERSETS.md');
  const whitelist = existsSync(ecartsPath)
    ? parseEcartsVoulus(readText(ecartsPath))
    : new Set<string>();

  // index des leçons
  const indexParsed = parseDataFile(
    readText(join(dataDir, 'index-lecons.js')),
    'data/index-lecons.js',
  );
  const lessonIndex = indexParsed.value as Record<string, LessonIndexEntry>;

  // tables de correspondance des identifiants (gel des livres) : ancien identifiant de position → id
  const idMap = loadIdMaps(join(contentDir, 'ids'), issues);
  const frozen = frozenLevels(idMap);
  const declared = loadLineage(join(contentDir, 'ids'), issues);
  const seenIds = new Set<string>();

  const verseStats: VerseStats = { total: 0, identique: 0, extrait: 0, voulu: 0, erreurs: 0 };
  const verse = (
    level: string,
    unitFile: string,
    file: string,
    unitId: string,
    ar: string,
    ref: string | undefined,
  ) => {
    verseStats.total++;
    const r = checkVerse(ar, ref, tanzil);
    if (r.status === 'identique') verseStats.identique++;
    else if (r.status === 'extrait') {
      verseStats.extrait++;
      if (!/(début|fin|extrait|milieu|suite)/i.test(ref ?? ''))
        issues.push({
          severity: 'avertissement',
          code: 'coran_extrait_non_signale',
          file,
          unit: unitId,
          message: `${ref} : extrait exact de Tanzil, non marqué (début/fin/extrait) dans la référence`,
        });
    } else if (ref && whitelist.has(whitelistKey(level, unitFile, ref))) {
      verseStats.voulu++;
      issues.push({
        severity: 'avertissement',
        code: 'coran_ecart_voulu',
        file,
        unit: unitId,
        message: `${ref} : écart voulu (ECARTS_VERSETS.md) — ${r.detail ?? r.status}`,
      });
    } else {
      verseStats.erreurs++;
      issues.push({
        severity: 'erreur',
        code: `coran_${r.status}`,
        file,
        unit: unitId,
        message: `${ref ?? '(sans référence)'} : ${r.detail ?? r.status}`,
      });
    }
  };

  // Lecture du Coran (qc, lot 28) : extraits « src: Q:… » comparés octet par octet à Tanzil (règle E2 de
  // qc-check.ps1) ; aucune liste blanche : tout écart est bloquant
  const qcVerse = (file: string, unitId: string, path: string, src: string, ar: unknown) => {
    verseStats.total++;
    const r =
      typeof ar === 'string'
        ? checkQcSource(ar, src, tanzil)
        : { status: 'sans_texte', detail: 'extrait sans texte « ar »' };
    if (r.status === 'identique') verseStats.identique++;
    else if (r.status === 'extrait') verseStats.extrait++;
    else {
      verseStats.erreurs++;
      issues.push({
        severity: 'erreur',
        code: `coran_${r.status}`,
        file,
        unit: unitId,
        message: `${path} ${src} : ${r.detail ?? r.status}`,
      });
    }
  };

  // illustrations (ordre des pages des livres, zz-sansvisage.js en dernier), SVG validé
  let illustrations: Map<string, Illustration> | null = null;
  const illusDir = join(contentDir, 'illus');
  if (opts.withIllustrations !== false && existsSync(illusDir)) {
    const il = loadIllustrations(illusDir);
    illustrations = il.illustrations;
    issues.push(...il.issues);
  }

  const levels: ImportedLevel[] = [];
  for (const code of opts.levels) {
    const dir = join(dataDir, code);
    if (!existsSync(dir)) {
      issues.push({
        severity: 'erreur',
        code: 'niveau_absent',
        message: `dossier data/${code} absent`,
      });
      continue;
    }
    const bookParsed = parseDataFile(readText(join(dir, 'book.js')), `data/${code}/book.js`);
    const book = bookParsed.value as Book;
    if (book.code !== code)
      issues.push({
        severity: 'erreur',
        code: 'book_code',
        file: `data/${code}/book.js`,
        message: `code « ${book.code} » ≠ ${code}`,
      });

    const units: ImportedUnit[] = [];
    const translit = new Map<string, number>();
    for (const f of readdirSync(dir)
      .filter((x) => UNIT_FILE.test(x))
      .sort()) {
      const rel = `data/${code}/${f}`;
      const unitFile = basename(f, '.js');
      const id = `${code}.${unitFile}`;
      let parsed;
      try {
        parsed = parseDataFile(readText(join(dir, f)), rel);
      } catch (e) {
        issues.push({
          severity: 'erreur',
          code: 'lecture',
          file: rel,
          unit: id,
          message: (e as Error).message,
        });
        continue;
      }
      if (parsed.callee !== 'AW.lesson')
        issues.push({
          severity: 'erreur',
          code: 'appel',
          file: rel,
          unit: id,
          message: `appel ${parsed.callee} au lieu de AW.lesson`,
        });
      if (!parsed.strict)
        issues.push({
          severity: 'avertissement',
          code: 'json_non_strict',
          file: rel,
          unit: id,
          message:
            'fichier en JavaScript non strict : lu dans le bac à sable (à convertir en JSON strict dans les livres)',
        });
      const L = parsed.value as Lesson;
      for (const k of ['n', 'type', 'titre_ar', 'titre_fr'] as const) {
        if (L[k] === undefined || L[k] === '')
          issues.push({
            severity: 'erreur',
            code: 'champ_obligatoire',
            file: rel,
            unit: id,
            message: `champ « ${k} » absent`,
          });
      }
      const kind = (KINDS.has(L.type) ? L.type : 'lecon') as UnitKind;
      if (!KINDS.has(L.type))
        issues.push({
          severity: 'erreur',
          code: 'type_unite',
          file: rel,
          unit: id,
          message: `type « ${String(L.type)} » inconnu`,
        });
      if (L.n !== Number(unitFile.slice(1)))
        issues.push({
          severity: 'avertissement',
          code: 'rang',
          file: rel,
          unit: id,
          message: `n=${L.n} ≠ rang du fichier ${unitFile}`,
        });
      const idx = lessonIndex[id];
      let numBilan: number | null = null;
      if (!idx)
        issues.push({
          severity: 'avertissement',
          code: 'index_absent',
          file: rel,
          unit: id,
          message: 'unité absente de index-lecons.js',
        });
      else {
        if (idx.t !== kind)
          issues.push({
            severity: 'avertissement',
            code: 'index_type',
            file: rel,
            unit: id,
            message: `index : type ${idx.t} ≠ ${kind}`,
          });
        if (kind === 'lecon' && L.num_lecon !== undefined && idx.n !== L.num_lecon)
          issues.push({
            severity: 'avertissement',
            code: 'index_num',
            file: rel,
            unit: id,
            message: `index : n=${idx.n} ≠ num_lecon ${L.num_lecon}`,
          });
        if (kind === 'bilan') numBilan = idx.n;
      }

      const exercises: ImportedExercise[] = (L.exercices ?? []).map((ex, i) => {
        // identifiant : champ « id » explicite des livres gelés, sinon identifiant de position (ancien)
        const positional = `${id}.ex${i + 1}`;
        const explicit = (ex as { id?: unknown }).id;
        let exId = positional;
        if (explicit !== undefined) {
          if (
            typeof explicit !== 'string' ||
            !EXERCISE_ID.test(explicit) ||
            !explicit.startsWith(`${id}.`)
          )
            issues.push({
              severity: 'erreur',
              code: 'id_exercice',
              file: rel,
              unit: id,
              message: `${positional} : identifiant explicite invalide (${String(explicit)})`,
            });
          else exId = explicit;
          // lot F1 (E5) : plus AUCUNE comparaison à la position. La table de gel dit seulement quel
          // identifiant a reçu l'ancienne clé de position au moment du gel ; un exercice inséré, déplacé ou
          // retiré ensuite garde (ou libère) son id sans décaler les autres (contrôle global plus bas).
        } else if (frozen.has(code))
          issues.push({
            severity: 'erreur',
            code: 'id_absent',
            file: rel,
            unit: id,
            message: `${positional} : livre gelé sans champ « id » (un identifiant de position n'est plus accepté : lancer gel-ids)`,
          });
        if (seenIds.has(exId))
          issues.push({
            severity: 'erreur',
            code: 'id_double',
            file: rel,
            unit: id,
            message: `identifiant d'exercice en double : ${exId}`,
          });
        seenIds.add(exId);
        // l'empreinte ne dépend pas du champ « id » : ajouter l'identifiant ne périme aucune réponse
        const { id: _omit, ...body } = ex as typeof ex & { id?: unknown };
        void _omit;
        const hash = contentHash(body);
        if ((LANGUAGE_EXERCISE_TYPES as readonly string[]).includes(ex.type)) {
          for (const p of checkLanguageExercise(ex))
            issues.push({
              severity: 'erreur',
              code: 'corrige',
              file: rel,
              unit: id,
              message: `${exId} (${ex.type}) : ${p}`,
            });
        }
        return {
          id: exId,
          hash,
          key: `${exId}#${hash.slice(0, 12)}`,
          position: i + 1,
          type: ex.type,
          graded: isGradedType(ex.type),
          itemCount: itemCount(ex),
          content: ex,
        };
      });

      for (const v of L.coran?.versets ?? []) {
        if (v && typeof v.ar === 'string') verse(code, unitFile, rel, id, v.ar, v.ref_fr);
      }
      if (/^qc\d/.test(code))
        for (const s of qcQuranSources(L)) qcVerse(rel, id, s.path, s.src, s.ar);
      issues.push(...checkUnit(id, code, L, illustrations, rel));
      for (const w of translitWords(L, code)) translit.set(w, (translit.get(w) ?? 0) + 1);

      units.push({
        id,
        level: code,
        file: rel,
        n: L.n,
        kind,
        numLecon: kind === 'lecon' ? (L.num_lecon ?? idx?.n ?? null) : null,
        numBilan,
        titreAr: L.titre_ar,
        titreFr: L.titre_fr,
        sha256: contentHash(L),
        strict: parsed.strict,
        content: L,
        exercises,
      });
    }
    if (translit.size)
      issues.push({
        severity: 'avertissement',
        code: 'translitteration',
        file: `data/${code}`,
        message: `${translit.size} mot(s) avec signes de translittération dans des champs élève (noms de signes à franciser, REGLES §4) : ${[
          ...translit,
        ]
          .sort((a, b) => b[1] - a[1])
          .map(([w, n]) => `${w} ×${n}`)
          .join(', ')}`,
      });
    levels.push({ code, book, units });
  }

  // lignée des exercices (lot F1, E5) : tables de gel (ancienne clé de position → id, seulement si différent)
  // + lignée déclarée par les livres ; un id gelé disparu sans déclaration est signalé
  const lineage: LineageEntry[] = [];
  const imported = new Set(opts.levels);
  const levelOf = (exId: string) => exId.split('.')[0] ?? '';
  const retired = new Set(declared.filter((d) => d.kind !== 'gel').map((d) => d.from));
  for (const [from, to] of idMap ?? []) {
    if (!imported.has(levelOf(to))) continue;
    if (from !== to) lineage.push({ from, to, kind: 'gel', note: null });
    if (!seenIds.has(to) && !retired.has(to))
      issues.push({
        severity: 'avertissement',
        code: 'id_disparu',
        unit: to.split('.').slice(0, 2).join('.'),
        message: `${to} : exercice gelé absent du livre (à déclarer dans ids/lignee.json : retiré, remplacé…)`,
      });
  }
  for (const d of declared) {
    if (!imported.has(levelOf(d.from))) continue;
    if (d.to !== null && !seenIds.has(d.to))
      issues.push({
        severity: 'erreur',
        code: 'lignee_cible',
        file: 'ids/lignee.json',
        message: `${d.from} → ${d.to} : exercice cible absent des livres`,
      });
    else lineage.push(d);
  }

  // carnets de hifẓ des niveaux importés + fichiers communs
  const hifz: HifzBook[] = [];
  const hifzShared: Record<string, unknown> = {};
  const hifzDir = join(dataDir, 'hifz');
  if (existsSync(hifzDir)) {
    const carnets = opts.levels.filter((c) => !opts.hifzLevels || opts.hifzLevels.includes(c));
    for (const code of carnets) {
      const p = join(hifzDir, `${code}.js`);
      if (!existsSync(p)) continue;
      const parsed = parseDataFile(readText(p), `data/hifz/${code}.js`);
      const H = parsed.value as HifzBook & { tajwid_ex?: Array<{ ar?: string; ref_fr?: string }> };
      if (!parsed.strict)
        issues.push({
          severity: 'avertissement',
          code: 'json_non_strict',
          file: `data/hifz/${code}.js`,
          message: 'carnet non strict',
        });
      for (const ex of H.tajwid_ex ?? []) {
        if (ex.ar)
          verse(
            `hifz-${code}`,
            'tajwid_ex',
            `data/hifz/${code}.js`,
            `hifz.${code}`,
            ex.ar,
            ex.ref_fr,
          );
      }
      hifz.push(H);
    }
    for (const name of ['commun', 'adab', 'tajwid']) {
      const p = join(hifzDir, `${name}.js`);
      if (existsSync(p))
        hifzShared[name] = parseDataFile(readText(p), `data/hifz/${name}.js`).value;
    }
  }

  // registre canonique
  let registry: RegistryData | null = null;
  if (opts.withRegistry !== false) {
    const reg = (n: string) => {
      const p = join(contentDir, 'registre', `${n}.json`);
      return existsSync(p)
        ? (JSON.parse(readText(p).replace(/^\uFEFF/, '')) as Record<
            string,
            Record<string, unknown>
          >)
        : {};
    };
    registry = { coran: reg('coran'), hadiths: reg('hadiths'), fiqh: reg('fiqh') };
    // le texte des versets du registre doit être celui de Tanzil
    for (const [rid, e] of Object.entries(registry.coran)) {
      const ref = String(e.ref ?? '');
      const texte = typeof e.texte === 'string' ? e.texte : '';
      if (!texte) continue;
      const r = checkVerse(texte, ref, tanzil);
      if (r.status !== 'identique')
        issues.push({
          severity: 'erreur',
          code: 'registre_coran',
          unit: rid,
          message: `${ref} : ${r.detail ?? r.status}`,
        });
    }
  }

  // bibliothèque des livrets gradués (data/lect : catalogue.js + un fichier par livret)
  const booklets: Booklet[] = [];
  let catalogue: Array<Record<string, unknown>> = [];
  const lectDir = join(dataDir, 'lect');
  if (opts.withBooklets !== false && existsSync(lectDir)) {
    const cat = join(lectDir, 'catalogue.js');
    if (existsSync(cat))
      catalogue = parseDataFile(readText(cat), 'data/lect/catalogue.js').value as typeof catalogue;
    for (const f of readdirSync(lectDir)
      .filter((n) => /^[a-z]{2,3}\d{1,2}-\d{2}\.js$/.test(n))
      .sort()) {
      const rel = `data/lect/${f}`;
      try {
        const parsed = parseDataFile(readText(join(lectDir, f)), rel);
        const B = parsed.value as Record<string, unknown>;
        if (!parsed.strict)
          issues.push({
            severity: 'avertissement',
            code: 'json_non_strict',
            file: rel,
            message: 'livret non strict',
          });
        booklets.push({
          code: String(B.code ?? basename(f, '.js')),
          level: String(B.niveau ?? ''),
          content: B,
        });
      } catch (e) {
        issues.push({
          severity: 'erreur',
          code: 'livret_illisible',
          file: rel,
          message: (e as Error).message,
        });
      }
    }
  }

  // l'empreinte de la source dépend aussi des niveaux choisis : ajouter un niveau crée une nouvelle édition
  const manifest = join(contentDir, 'MANIFEST.sha256');
  const sourceSha256 = existsSync(manifest)
    ? sha256Hex(
        `${readText(manifest)}\nniveaux:${opts.levels.join(',')}\nlivrets:${booklets.length}`,
      )
    : contentHash(levels.map((l) => l.units.map((u) => u.sha256)));

  // documents d'évaluation (espace école : décision de fin de niveau, certificats) — lus, jamais modifiés
  const evalDocs: Record<string, unknown> = {};
  for (const k of ['certificats', 'referentiel', 'regles']) {
    const f = join(dataDir, 'eval', `${k}.js`);
    if (!existsSync(f)) continue;
    try {
      evalDocs[k] = parseDataFile(readText(f), `data/eval/${k}.js`).value;
    } catch (e) {
      issues.push({
        severity: 'erreur',
        code: 'evaluation_illisible',
        file: `data/eval/${k}.js`,
        message: String(e),
      });
    }
  }

  // activité « racines » (lot 15) : éléments vérifiés mot pour mot dans les leçons gelées de l'édition
  const rootSources = new Map<string, string>();
  for (const it of ROOT_ITEMS) {
    const [lv, lesson] = it.source.split('.');
    const f = join(dataDir, lv!, `${lesson}.js`);
    if (opts.levels.includes(lv!) && existsSync(f)) rootSources.set(it.source, readText(f));
  }
  if (rootSources.size) {
    const r = verifyRootItems(rootSources);
    evalDocs.racines = r.ok;
    for (const x of r.rejected)
      issues.push({
        severity: 'avertissement',
        code: 'racine_ecartee',
        message: `activité racines : ${x.id} écarté (${x.reason})`,
      });
  }

  return {
    contentDir,
    sourceSha256,
    levels,
    lessonIndex,
    hifz,
    hifzShared,
    registry,
    illustrations,
    booklets,
    catalogue,
    tanzil,
    quranData,
    evalDocs,
    verseStats,
    lineage,
    issues,
  };
}

export function blockingIssues(load: Pick<EditionLoad, 'issues'>): Issue[] {
  return load.issues.filter((i) => i.severity === 'erreur');
}
