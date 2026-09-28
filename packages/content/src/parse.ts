/**
 * Lecture des fichiers des livres, SANS les modifier.
 *  - leçons, carnets, etc. : `AW.xxx(<JSON strict>);` → on prend le texte entre la première `(` et la
 *    dernière `)` (exactement comme la commande de validation de SCHEMA.md) et on le lit en JSON strict ;
 *  - `book.js`, `index-lecons.js` et les rares leçons historiques en JavaScript non strict
 *    (ex. en1/l01.js, écrit avant la règle du JSON strict) : évaluation dans un BAC À SABLE
 *    (contexte V8 vide, sans prototype hôte, sans génération de code, sans require/process, délai 1 s).
 */
import vm from 'node:vm';

export class ContentParseError extends Error {
  constructor(
    message: string,
    readonly file: string,
  ) {
    super(`${file} : ${message}`);
    this.name = 'ContentParseError';
  }
}

/** Texte entre la première `(` et la dernière `)`. */
export function extractCallPayload(src: string, file = '?'): string {
  const i = src.indexOf('(');
  const j = src.lastIndexOf(')');
  if (i < 0 || j <= i) throw new ContentParseError('appel AW.xxx(...) introuvable', file);
  return src.slice(i + 1, j);
}

/** Nom de l'appel (ex. `AW.lesson`) au début du fichier. */
export function calleeName(src: string): string | null {
  const m = /^\s*(?:\uFEFF)?\s*(AW\.[A-Za-z_]\w*)\s*[(=]/.exec(src);
  return m?.[1] ?? null;
}

/** Lecture JSON strict de `AW.xxx(<JSON>);`. Lève une erreur si le JSON n'est pas strict. */
export function parseStrictCall(src: string, file = '?'): unknown {
  const payload = extractCallPayload(src, file);
  try {
    return JSON.parse(payload);
  } catch (e) {
    throw new ContentParseError(`JSON non strict (${(e as Error).message})`, file);
  }
}

const SANDBOX_PRELUDE = `
"use strict";
var __out = {};
var AW = {};
function __cap(name) { return function (a, b, c) { __out[name] = arguments.length > 1 ? [a, b, c] : a; }; }
AW.book = __cap('book'); AW.lesson = __cap('lesson'); AW.hifz = __cap('hifz');
AW.hifzCommun = __cap('hifzCommun'); AW.hifzAdab = __cap('hifzAdab'); AW.hifzTajwid = __cap('hifzTajwid');
AW.lecture = __cap('lecture'); AW.lectCatalogue = __cap('lectCatalogue'); AW.referentiel = __cap('referentiel');
AW.positionnement = __cap('positionnement'); AW.livret = __cap('livret');
var __ill = {}; __out.illus = __ill;
AW.illus = function (k, vb, svg) { __ill[String(k)] = { vb: String(vb), svg: String(svg) }; };
`;

/**
 * Évalue un fichier de données non strict dans un bac à sable et renvoie les valeurs capturées
 * (appels `AW.xxx(...)` et affectations `AW.xxx = ...`), sous forme de données JSON pures.
 */
export function evalSandboxed(src: string, file = '?', timeoutMs = 1000): Record<string, unknown> {
  // Contexte sans prototype : aucun accès aux constructeurs de l'hôte (pas d'évasion par .constructor).
  const context = vm.createContext(Object.create(null) as object, {
    codeGeneration: { strings: false, wasm: false },
    name: `awform-sandbox:${file}`,
  });
  const code =
    SANDBOX_PRELUDE +
    src +
    `
;(function () {
  for (var k in AW) { if (typeof AW[k] !== 'function') __out[k] = AW[k]; }
  return JSON.stringify(__out);
})();`;
  let json: unknown;
  try {
    json = new vm.Script(code, { filename: file }).runInContext(context, {
      timeout: timeoutMs,
      breakOnSigint: true,
    });
  } catch (e) {
    throw new ContentParseError(
      `évaluation impossible dans le bac à sable (${(e as Error).message})`,
      file,
    );
  }
  if (typeof json !== 'string')
    throw new ContentParseError('résultat du bac à sable invalide', file);
  // Les données repassent par JSON : on ne récupère que des valeurs pures (pas de fonction, pas d'objet hôte).
  return JSON.parse(json) as Record<string, unknown>;
}

export interface ParsedCall {
  callee: string;
  value: unknown;
  /** true si le fichier est en JSON strict ; false s'il a fallu le bac à sable */
  strict: boolean;
}

/**
 * Lit un fichier `AW.xxx(...)` : JSON strict d'abord ; sinon bac à sable (avertissement à signaler).
 */
export function parseDataFile(src: string, file = '?'): ParsedCall {
  const callee = calleeName(src);
  if (!callee)
    throw new ContentParseError('le fichier ne commence pas par AW.xxx(...) ou AW.xxx=', file);
  const key = callee.slice(3);
  if (/^\s*(?:\uFEFF)?\s*AW\.\w+\s*\(/.test(src)) {
    try {
      return { callee, value: parseStrictCall(src, file), strict: true };
    } catch {
      /* repli : bac à sable */
    }
  } else {
    // affectation `AW.xxx = {…};` : JSON strict entre la première `{` et la dernière `}` si possible
    const i = src.indexOf('{');
    const j = src.lastIndexOf('}');
    if (i >= 0 && j > i) {
      try {
        return { callee, value: JSON.parse(src.slice(i, j + 1)), strict: true };
      } catch {
        /* repli : bac à sable */
      }
    }
  }
  const out = evalSandboxed(src, file);
  if (!(key in out)) throw new ContentParseError(`aucune valeur capturée pour ${callee}`, file);
  return { callee, value: out[key], strict: false };
}
