/**
 * Projections (cahier des charges §5.4) : ce que chaque rôle reçoit. UNE seule implémentation, testée.
 *  - élève — entraînement : sans `tr`, sans guide (`guide`, `*guide_fr`, `sources_fr`), sans espace parent
 *    (`parents_fr`, `travail_perso_fr`), sans scripts de dictée ; textes « non préparés » ABSENTS ;
 *    `lecture.phrases_masquees` absentes ; bilans/examens : versets sans traduction ; examen ou
 *    `lecture.sans_traduction` : lecture sans traduction ; bilans Enfants (en*) : seulement lettres, ligne
 *    de lecture et exercices (rendu du moteur `lectureBilan`). Les réponses d'ENTRAÎNEMENT restent (correction
 *    hors ligne, comme le corrigé du guide papier).
 *  - parent / adulte : élève + `parents_fr`, `travail_perso_fr`, scripts de dictée (mode « l'adulte lit »).
 *  - enseignant : leçon complète.
 *  - épreuve : élève SANS AUCUNE réponse (clés de corrigé retirées, `relier` remis en deux colonnes décalées).
 *  - publique (QR) : titre, objectifs, mots et images ; aucun exercice.
 * Aucune transformation du texte : on retire des champs, on ne réécrit jamais une chaîne.
 */

const STUDENT_DROP_KEYS = new Set(['tr', 'guide', 'sources_fr', 'parents_fr', 'travail_perso_fr']);

function isDropped(key: string): boolean {
  return STUDENT_DROP_KEYS.has(key) || key === 'guide_fr' || key.endsWith('_guide_fr');
}

type Obj = Record<string, unknown>;

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    const out: Obj = {};
    for (const [k, v] of Object.entries(value as Obj)) {
      if (!isDropped(k)) out[k] = strip(v);
    }
    return out;
  }
  return value;
}

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

function isEval(L: Obj): boolean {
  return L.type === 'bilan' || L.type === 'examen';
}

/** Projection élève (entraînement). `level` = code du niveau (règle des bilans Enfants). */
export function studentProjection<T>(lesson: T, level = ''): T {
  const L = strip(lesson) as Obj;
  const evaluation = isEval(L);

  // écriture : les scripts de dictée sont lus par l'adulte (espace parent / enseignant)
  if (isObj(L.ecriture)) delete L.ecriture.dictee;

  // lecture : phrases masquées, texte non préparé, traductions d'examen
  if (isObj(L.lecture)) {
    const R = L.lecture;
    delete R.phrases_masquees;
    if (R.non_prepare) {
      delete R.vedette;
      delete R.phrases;
      delete R.paragraphes;
    }
    if (L.type === 'examen' || R.sans_traduction) {
      if (isObj(R.vedette)) delete R.vedette.fr;
      for (const k of ['phrases', 'paragraphes'])
        if (Array.isArray(R[k])) for (const p of R[k] as unknown[]) if (isObj(p)) delete p.fr;
    }
  }

  // Coran : versets non préparés absents ; pas de traduction dans un bilan / examen
  if (isObj(L.coran)) {
    const Q = L.coran;
    if (Q.non_prepare) {
      Q.versets = [{ non_prepare: true }];
      delete Q.mots;
    } else if (Array.isArray(Q.versets)) {
      let np = false;
      Q.versets = (Q.versets as Obj[]).flatMap((v) => {
        if (!v.non_prepare) return [v];
        if (np) return [];
        np = true;
        return [{ non_prepare: true }];
      });
    }
    if (evaluation && Array.isArray(Q.versets)) for (const v of Q.versets as Obj[]) delete v.fr;
  }

  // bilans Enfants : le livre n'affiche que lettres, ligne « Je relis » et exercices
  if (evaluation && /^en\d/.test(level)) {
    for (const k of ['dialogue', 'coran', 'fiqh_adab', 'rubriques', 'mots', 'scene']) delete L[k];
    if (isObj(L.lecture)) {
      const R = L.lecture;
      for (const k of Object.keys(R)) if (k !== 'ligne' && k !== 'non_prepare') delete R[k];
    }
  }
  return L as T;
}

/** Projection parent / adulte : élève + mot aux parents, travail personnel, scripts de dictée. */
export function parentProjection<T>(lesson: T, level = ''): T {
  const src = lesson as Obj;
  const L = studentProjection(lesson, level) as Obj;
  if (typeof src.parents_fr === 'string') L.parents_fr = src.parents_fr;
  if (typeof src.travail_perso_fr === 'string') L.travail_perso_fr = src.travail_perso_fr;
  const E = src.ecriture;
  if (isObj(E) && Array.isArray(E.dictee)) {
    L.ecriture = {
      ...(isObj(L.ecriture) ? L.ecriture : {}),
      dictee: E.dictee,
      dictee_n: E.dictee_n,
    };
  }
  return L as T;
}

/** Projection enseignant : la leçon complète (copie). */
export function teacherProjection<T>(lesson: T): T {
  return structuredClone(lesson);
}

/** Clés de corrigé retirées d'une épreuve. */
export const ANSWER_KEYS: ReadonlySet<string> = new Set([
  'reponse',
  'reponses',
  'vrai',
  'oui',
  'correction_ar',
  'phrase',
  'dit',
  'mot',
  'rang',
  'col',
  'reponse_ar',
  'reponse_fr',
  'justification_fr',
  'corrige_fr',
  'analyse_fr',
]);

/** Décalage de la colonne de droite d'un `relier` (même règle que le moteur : rotation de n/2). */
function rotate<T>(a: T[], n: number): T[] {
  if (a.length === 0) return a;
  const k = n % a.length;
  return a.slice(k).concat(a.slice(0, k));
}

function examExercise(ex: Obj): Obj {
  if (ex.type === 'relier' && Array.isArray(ex.items)) {
    const items = ex.items as Obj[];
    const right = rotate(
      items.map((it) => ({ img: it.img, fr: it.fr })),
      Math.max(1, Math.floor(items.length / 2)),
    );
    const rest: Obj = { ...ex };
    delete rest.items;
    return { ...rest, gauche: items.map((it) => ({ ar: it.ar })), droite: right };
  }
  const clean = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(clean);
    if (isObj(v)) {
      const o: Obj = {};
      for (const [k, x] of Object.entries(v)) if (!ANSWER_KEYS.has(k)) o[k] = clean(x);
      return o;
    }
    return v;
  };
  return clean(ex) as Obj;
}

/** Projection épreuve (bilan ou examen noté) : AUCUNE réponse. */
export function examProjection<T>(lesson: T, level = ''): T {
  const L = studentProjection(lesson, level) as Obj;
  if (Array.isArray(L.exercices)) L.exercices = (L.exercices as Obj[]).map(examExercise);
  return L as T;
}

/** Projection publique (page du QR code) : ni exercices, ni réponses. */
export function publicProjection(lesson: unknown): Obj {
  const L = lesson as Obj;
  const mots = Array.isArray(L.mots)
    ? (L.mots as Obj[]).map((m) => ({ ar: m.ar, fr: m.fr, img: m.img }))
    : [];
  const objectifs = Array.isArray(L.objectifs)
    ? (L.objectifs as Obj[]).map((o) => ({ ar: o.ar, fr: o.fr }))
    : [];
  return {
    n: L.n,
    type: L.type,
    num_lecon: L.num_lecon,
    titre_ar: L.titre_ar,
    titre_fr: L.titre_fr,
    lettres: Array.isArray(L.lettres)
      ? (L.lettres as Obj[]).map((x) => ({ l: x.l, nom_ar: x.nom_ar }))
      : [],
    objectifs,
    mots,
  };
}

/** Chemins des champs réservés (guide, translittération, espace parent) encore présents. */
export function forbiddenPaths(value: unknown, path = '$'): string[] {
  const found: string[] = [];
  if (Array.isArray(value))
    value.forEach((v, i) => found.push(...forbiddenPaths(v, `${path}[${i}]`)));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Obj)) {
      if (isDropped(k)) found.push(`${path}.${k}`);
      found.push(...forbiddenPaths(v, `${path}.${k}`));
    }
  }
  return found;
}

/** Chemins de clés de corrigé présentes dans les exercices (test de la projection épreuve). */
export function answerPaths(lesson: unknown): string[] {
  const found: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (isObj(v))
      for (const [k, x] of Object.entries(v)) {
        if (ANSWER_KEYS.has(k)) found.push(`${path}.${k}`);
        walk(x, `${path}.${k}`);
      }
  };
  walk((lesson as Obj)?.exercices, '$.exercices');
  return found;
}

/** Clés d'illustration utilisées par une leçon (scène, mots, exercices, dialogue). */
export function illustrationKeys(lesson: unknown): string[] {
  const keys = new Set<string>();
  const walk = (v: unknown, parent: string) => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, parent));
    else if (isObj(v)) {
      for (const [k, x] of Object.entries(v)) {
        if (k === 'img' && typeof x === 'string' && x) keys.add(x);
        else if ((k === 'persos' || k === 'props') && Array.isArray(x))
          x.forEach((p) => typeof p === 'string' && keys.add(p));
        else walk(x, k);
      }
    }
  };
  walk(lesson, '$');
  return [...keys].sort();
}
