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
import { checkVerse, loadTanzil, parseEcartsVoulus, whitelistKey, type Tanzil } from './quran.js';
import { plain } from './text.js';
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
  tanzil: Tanzil;
  verseStats: VerseStats;
  issues: Issue[];
}

export interface LoadOptions {
  contentDir: string;
  levels: string[];
  /** charger aussi le registre (coran, hadiths, fiqh) — par défaut oui */
  withRegistry?: boolean;
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
    if (target.startsWith(head) && canJoin(target.slice(head.length), parts.filter((_, j) => j !== i), sep))
      return true;
  }
  return false;
}

function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

export function loadEdition(opts: LoadOptions): EditionLoad {
  const { contentDir } = opts;
  const issues: Issue[] = [];
  const dataDir = join(contentDir, 'data');

  // Tanzil + liste blanche des écarts voulus
  const tanzil = loadTanzil(readText(join(contentDir, 'coran', 'tanzil-uthmani.tsv')));
  if (tanzil.size !== 6236)
    issues.push({ severity: 'erreur', code: 'tanzil_incomplet', message: `${tanzil.size} versets au lieu de 6 236` });
  const ecartsPath = join(contentDir, 'ECARTS_VERSETS.md');
  const whitelist = existsSync(ecartsPath) ? parseEcartsVoulus(readText(ecartsPath)) : new Set<string>();

  // index des leçons
  const indexParsed = parseDataFile(readText(join(dataDir, 'index-lecons.js')), 'data/index-lecons.js');
  const lessonIndex = indexParsed.value as Record<string, LessonIndexEntry>;

  const verseStats: VerseStats = { total: 0, identique: 0, extrait: 0, voulu: 0, erreurs: 0 };
  const verse = (level: string, unitFile: string, file: string, unitId: string, ar: string, ref: string | undefined) => {
    verseStats.total++;
    const r = checkVerse(ar, ref, tanzil);
    if (r.status === 'identique') verseStats.identique++;
    else if (r.status === 'extrait') {
      verseStats.extrait++;
      if (!/(début|fin|extrait|milieu|suite)/i.test(ref ?? ''))
        issues.push({ severity: 'avertissement', code: 'coran_extrait_non_signale', file, unit: unitId, message: `${ref} : extrait exact de Tanzil, non marqué (début/fin/extrait) dans la référence` });
    } else if (ref && whitelist.has(whitelistKey(level, unitFile, ref))) {
      verseStats.voulu++;
      issues.push({ severity: 'avertissement', code: 'coran_ecart_voulu', file, unit: unitId, message: `${ref} : écart voulu (ECARTS_VERSETS.md) — ${r.detail ?? r.status}` });
    } else {
      verseStats.erreurs++;
      issues.push({ severity: 'erreur', code: `coran_${r.status}`, file, unit: unitId, message: `${ref ?? '(sans référence)'} : ${r.detail ?? r.status}` });
    }
  };

  const levels: ImportedLevel[] = [];
  for (const code of opts.levels) {
    const dir = join(dataDir, code);
    if (!existsSync(dir)) {
      issues.push({ severity: 'erreur', code: 'niveau_absent', message: `dossier data/${code} absent` });
      continue;
    }
    const bookParsed = parseDataFile(readText(join(dir, 'book.js')), `data/${code}/book.js`);
    const book = bookParsed.value as Book;
    if (book.code !== code)
      issues.push({ severity: 'erreur', code: 'book_code', file: `data/${code}/book.js`, message: `code « ${book.code} » ≠ ${code}` });

    const units: ImportedUnit[] = [];
    for (const f of readdirSync(dir).filter((x) => UNIT_FILE.test(x)).sort()) {
      const rel = `data/${code}/${f}`;
      const unitFile = basename(f, '.js');
      const id = `${code}.${unitFile}`;
      let parsed;
      try {
        parsed = parseDataFile(readText(join(dir, f)), rel);
      } catch (e) {
        issues.push({ severity: 'erreur', code: 'lecture', file: rel, unit: id, message: (e as Error).message });
        continue;
      }
      if (parsed.callee !== 'AW.lesson')
        issues.push({ severity: 'erreur', code: 'appel', file: rel, unit: id, message: `appel ${parsed.callee} au lieu de AW.lesson` });
      if (!parsed.strict)
        issues.push({ severity: 'avertissement', code: 'json_non_strict', file: rel, unit: id, message: 'fichier en JavaScript non strict : lu dans le bac à sable (à convertir en JSON strict dans les livres)' });
      const L = parsed.value as Lesson;
      for (const k of ['n', 'type', 'titre_ar', 'titre_fr'] as const) {
        if (L[k] === undefined || L[k] === '')
          issues.push({ severity: 'erreur', code: 'champ_obligatoire', file: rel, unit: id, message: `champ « ${k} » absent` });
      }
      const kind = (KINDS.has(L.type) ? L.type : 'lecon') as UnitKind;
      if (!KINDS.has(L.type))
        issues.push({ severity: 'erreur', code: 'type_unite', file: rel, unit: id, message: `type « ${String(L.type)} » inconnu` });
      if (L.n !== Number(unitFile.slice(1)))
        issues.push({ severity: 'avertissement', code: 'rang', file: rel, unit: id, message: `n=${L.n} ≠ rang du fichier ${unitFile}` });
      const idx = lessonIndex[id];
      let numBilan: number | null = null;
      if (!idx) issues.push({ severity: 'avertissement', code: 'index_absent', file: rel, unit: id, message: 'unité absente de index-lecons.js' });
      else {
        if (idx.t !== kind)
          issues.push({ severity: 'avertissement', code: 'index_type', file: rel, unit: id, message: `index : type ${idx.t} ≠ ${kind}` });
        if (kind === 'lecon' && L.num_lecon !== undefined && idx.n !== L.num_lecon)
          issues.push({ severity: 'avertissement', code: 'index_num', file: rel, unit: id, message: `index : n=${idx.n} ≠ num_lecon ${L.num_lecon}` });
        if (kind === 'bilan') numBilan = idx.n;
      }

      const exercises: ImportedExercise[] = (L.exercices ?? []).map((ex, i) => {
        const exId = `${id}.ex${i + 1}`;
        const hash = contentHash(ex);
        if ((LANGUAGE_EXERCISE_TYPES as readonly string[]).includes(ex.type)) {
          for (const p of checkLanguageExercise(ex))
            issues.push({ severity: 'erreur', code: 'corrige', file: rel, unit: id, message: `${exId} (${ex.type}) : ${p}` });
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
    levels.push({ code, book, units });
  }

  // carnets de hifẓ des niveaux importés + fichiers communs
  const hifz: HifzBook[] = [];
  const hifzShared: Record<string, unknown> = {};
  const hifzDir = join(dataDir, 'hifz');
  if (existsSync(hifzDir)) {
    for (const code of opts.levels) {
      const p = join(hifzDir, `${code}.js`);
      if (!existsSync(p)) continue;
      const parsed = parseDataFile(readText(p), `data/hifz/${code}.js`);
      const H = parsed.value as HifzBook & { tajwid_ex?: Array<{ ar?: string; ref_fr?: string }> };
      if (!parsed.strict)
        issues.push({ severity: 'avertissement', code: 'json_non_strict', file: `data/hifz/${code}.js`, message: 'carnet non strict' });
      for (const ex of H.tajwid_ex ?? []) {
        if (ex.ar) verse(`hifz-${code}`, 'tajwid_ex', `data/hifz/${code}.js`, `hifz.${code}`, ex.ar, ex.ref_fr);
      }
      hifz.push(H);
    }
    for (const name of ['commun', 'adab', 'tajwid']) {
      const p = join(hifzDir, `${name}.js`);
      if (existsSync(p)) hifzShared[name] = parseDataFile(readText(p), `data/hifz/${name}.js`).value;
    }
  }

  // registre canonique
  let registry: RegistryData | null = null;
  if (opts.withRegistry !== false) {
    const reg = (n: string) => {
      const p = join(contentDir, 'registre', `${n}.json`);
      return existsSync(p) ? (JSON.parse(readText(p).replace(/^﻿/, '')) as Record<string, Record<string, unknown>>) : {};
    };
    registry = { coran: reg('coran'), hadiths: reg('hadiths'), fiqh: reg('fiqh') };
    // le texte des versets du registre doit être celui de Tanzil
    for (const [rid, e] of Object.entries(registry.coran)) {
      const ref = String(e.ref ?? '');
      const texte = typeof e.texte === 'string' ? e.texte : '';
      if (!texte) continue;
      const r = checkVerse(texte, ref, tanzil);
      if (r.status !== 'identique')
        issues.push({ severity: 'erreur', code: 'registre_coran', unit: rid, message: `${ref} : ${r.detail ?? r.status}` });
    }
  }

  const manifest = join(contentDir, 'MANIFEST.sha256');
  const sourceSha256 = existsSync(manifest)
    ? sha256Hex(readText(manifest))
    : contentHash(levels.map((l) => l.units.map((u) => u.sha256)));

  return { contentDir, sourceSha256, levels, lessonIndex, hifz, hifzShared, registry, tanzil, verseStats, issues };
}

export function blockingIssues(load: Pick<EditionLoad, 'issues'>): Issue[] {
  return load.issues.filter((i) => i.severity === 'erreur');
}
