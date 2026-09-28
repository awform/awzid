/**
 * Contrôles de contenu par unité (CDC §5.3-3) : personnages autorisés, illustrations existantes,
 * translittération dans les champs élève, réponses visibles dans un bilan (heuristique d'AUDIT_BILANS).
 */
import { PERSONNAGES } from './illus.js';
import { illustrationKeys, studentProjection } from './projection.js';
import { bare, plain } from './text.js';
import { personaKey } from './scene.js';

export { personaKey };
import type { Issue, Lesson } from './types.js';

type Obj = Record<string, unknown>;

const PERSO_SET: ReadonlySet<string> = new Set(PERSONNAGES);

/** Signes de translittération savante (REGLES §4) : interdits dans les champs élève, sauf exceptions. */
const TRANSLIT = /[āīūḥṣḍṭẓʿʾĀĪŪḤṢḌṬẒ]/;
/** Exceptions documentées (noms propres usuels, sourates, savants, recueils…) : un mot qui contient l'un de ces radicaux est admis. */
const TRANSLIT_ALLOWED = [
  'muḥammad',
  'ḥafṣ',
  'ʿāṣim',
  'al-bukhārī',
  'bukhārī',
  'nawawī',
  'ṭabarī',
  'saʿdī',
  'mālik',
  'qurʾān',
  'ʿabd',
  'ʿalī',
  'ʿumar',
  'ʿāʾisha',
  'fātiḥa',
  'ikhlāṣ',
  'ʿaṣr',
  'ʿalaq',
  'nās',
  'fīl',
  'kāfirūn',
  'tīn',
  'aʿlā',
  'ḥajj',
  'muʾminūn',
  'ḥujurāt',
  'naṣr',
  'sharḥ',
  // savants, prophètes, compagnons, lieux, recueils (noms propres usuels)
  'kathīr',
  'ibrāhīm',
  'ʿīsā',
  'mūsā',
  'ʿabbās',
  'kaʿba',
  'ḥirāʾ',
  'tirmidhī',
  'aḥmad',
  'isrāʾ',
  'shāfiʿī',
  'aʿrāf',
  'nisāʾ',
  'furqān',
  'abū',
  'dāwūd',
  'nasāʾī',
  'māja',
];

function frStrings(v: unknown, key: string, out: Array<[string, string]>) {
  if (Array.isArray(v)) v.forEach((x) => frStrings(x, key, out));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v as Obj)) frStrings(x, k, out);
  else if (typeof v === 'string' && key.endsWith('fr') && key !== 'ref_fr') out.push([key, v]);
}

/**
 * Mots des champs français visibles de l'élève qui portent des signes de translittération savante
 * (hors noms propres admis). Les noms de signes doivent être francisés (fatha, damma…) : REGLES §4.
 */
export function translitWords(L: Lesson, level: string): string[] {
  const strs: Array<[string, string]> = [];
  frStrings(studentProjection(L, level), '$', strs);
  const bad = new Set<string>();
  for (const [, s] of strs)
    for (const w of s.split(/[\s,.;:!?()«»"“”'’/]+/))
      if (TRANSLIT.test(w) && !TRANSLIT_ALLOWED.some((a) => w.toLowerCase().includes(a)))
        bad.add(w);
  return [...bad];
}

export function checkUnit(
  unitId: string,
  level: string,
  L: Lesson,
  illustrations: ReadonlyMap<string, unknown> | null,
  file: string,
): Issue[] {
  const issues: Issue[] = [];
  const push = (severity: Issue['severity'], code: string, message: string) =>
    issues.push({ severity, code, file, unit: unitId, message });

  // personnages : seulement les 12 de la charte
  const scenes: Obj[] = [];
  if (L.scene) scenes.push(L.scene as Obj);
  for (const s of scenes)
    for (const p of (Array.isArray(s.persos) ? s.persos : []) as string[])
      if (!PERSO_SET.has(p))
        push('erreur', 'personnage_interdit', `personnage « ${p} » hors charte`);
  for (const r of L.dialogue?.repliques ?? [])
    if (r.qui && !PERSO_SET.has(personaKey(r.qui)))
      push('erreur', 'personnage_interdit', `réplique de « ${r.qui} » : personnage hors charte`);

  // illustrations référencées
  if (illustrations) {
    const missing = illustrationKeys(L).filter((k) => !illustrations.has(k));
    if (missing.length)
      push('avertissement', 'illus_absente', `illustration(s) à dessiner : ${missing.join(', ')}`);
  }

  // bilans : aucun champ visible ne doit donner la réponse d'un exercice (heuristique)
  if (L.type === 'bilan' || L.type === 'examen') {
    const answers: string[] = [];
    for (const ex of (L.exercices ?? []) as Obj[]) {
      const items = (Array.isArray(ex.items) ? ex.items : []) as Obj[];
      if (ex.type === 'ordre') items.forEach((it) => answers.push(plain(it.phrase).trim()));
      if (ex.type === 'complete')
        items.forEach((it) =>
          answers.push(plain(`${it.avant ?? ''} ${it.reponse ?? ''} ${it.apres ?? ''}`).trim()),
        );
    }
    const P = studentProjection(L, level) as Obj;
    const visible: string[] = [];
    const R = (P.lecture ?? {}) as Obj;
    for (const x of (R.ligne ?? []) as string[]) visible.push(plain(x));
    for (const k of ['retiens', 'checklist'])
      for (const x of (P[k] ?? []) as Obj[]) visible.push(plain(x.ar));
    const D = (P.dialogue ?? {}) as Obj;
    for (const r of (D.repliques ?? []) as Obj[]) visible.push(plain(r.ar));
    const leaks = answers.filter(
      (a) => bare(a).length >= 8 && visible.some((v) => bare(v).includes(bare(a))),
    );
    if (leaks.length)
      push(
        'avertissement',
        'bilan_reponse_visible',
        `réponse visible dans le bilan : ${leaks.slice(0, 3).join(' / ')}`,
      );
  }
  return issues;
}
