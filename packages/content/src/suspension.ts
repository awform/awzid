/**
 * SUSPENSION D'URGENCE d'un contenu (lot F1, revue d'architecture M1) : entre deux éditions, l'administrateur
 * masque une leçon, un exercice ou un bloc (verset, hadith, règle de fiqh) signalé comme faux. Le masque est
 * appliqué PARTOUT où la leçon est servie (API, paquets hors ligne, page du QR code) et, sur l'appareil, aux
 * leçons déjà téléchargées (liste des suspensions gardée hors ligne). Le livre n'est jamais modifié.
 * Module sans dépendance (navigateur et serveur).
 *
 * Adresse d'un contenu : leçon + chemin dans la projection élève (`""` = la leçon entière,
 * `"coran.versets.2"`, `"rubriques.3.hadiths.0"`, `"fiqh_adab"`…) ou `"ex:<id d'exercice>"` (identifiant
 * gelé, indépendant de la position). `fp` : empreinte courte du bloc au moment de la suspension — si le bloc a
 * changé (nouvelle édition corrigée), le masque ne s'applique plus.
 */
export interface Suspension {
  unitId: string;
  path: string;
  fp?: string | null;
}

/** Chemin de bloc accepté (clés en minuscules commençant par une lettre — jamais `__proto__` —, profondeur bornée). */
export const BLOCK_PATH =
  /^(|ex:[a-z0-9_.-]{3,80}|[a-z][a-z_]{0,29}(\.(\d{1,3}|[a-z][a-z_]{0,29})){0,5})$/;

/** Empreinte courte et synchrone d'un bloc (FNV-1a 32 bits sur son JSON) : repérer un bloc changé. */
export function blockFingerprint(node: unknown): string {
  const s = JSON.stringify(node ?? null);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

type Obj = Record<string, unknown>;
/** propriété PROPRE (jamais héritée : ni `__proto__` ni `constructor`) ; compatible avec les anciens navigateurs */
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Bloc à ce chemin (ou undefined). */
export function blockAt(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const k of path ? path.split('.') : []) {
    if (cur === null || typeof cur !== 'object' || !own(cur, k)) return undefined;
    cur = (cur as Obj)[k];
  }
  return cur;
}

export interface MaskableUnit {
  id: string;
  lesson: unknown;
  exercises: Array<{ id: string; position: number }>;
}

/**
 * Applique les suspensions d'une leçon (copie : l'objet reçu n'est pas modifié). Leçon entière : il ne reste
 * que ses titres, `_suspendu: "unite"` et aucun exercice. Bloc ou exercice : remplacé par `{ suspendu: true }`
 * (les indices des autres blocs ne bougent pas) ; `_suspendu` = nombre de blocs masqués.
 */
export function applySuspensions<T extends MaskableUnit>(unit: T, list: readonly Suspension[]): T {
  const mine = list.filter((s) => s.unitId === unit.id);
  if (!mine.length) return unit;
  const L = (unit.lesson ?? {}) as Obj;
  if (mine.some((s) => s.path === ''))
    return {
      ...unit,
      lesson: { titre_ar: L.titre_ar, titre_fr: L.titre_fr, _suspendu: 'unite' },
      exercises: [],
    };
  const lesson = JSON.parse(JSON.stringify(L)) as Obj;
  let n = 0;
  for (const s of mine) {
    let path = s.path;
    if (path.startsWith('ex:')) {
      const e = unit.exercises.find((x) => x.id === path.slice(3));
      if (!e) continue;
      path = `exercices.${e.position - 1}`;
    }
    const keys = path.split('.');
    const last = keys.pop()!;
    if (!BLOCK_PATH.test(path)) continue;
    const parent = blockAt(lesson, keys.join('.')) as Obj | undefined;
    if (!parent || typeof parent !== 'object' || !own(parent, last)) continue;
    if (s.fp && !s.path.startsWith('ex:') && blockFingerprint(parent[last]) !== s.fp) continue;
    parent[last] = { suspendu: true };
    n++;
  }
  if (!n) return unit;
  lesson._suspendu = n;
  return { ...unit, lesson };
}

/** Le bloc a-t-il été masqué ? (aide aux lecteurs de leçon) */
export const isSuspended = (v: unknown): boolean =>
  !!v && typeof v === 'object' && (v as Obj).suspendu === true;
