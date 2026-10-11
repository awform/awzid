/**
 * A26b, phase 1 — ARABE CONVERSATIONNEL SANS IA : scénarios guidés tirés des dialogues des livres
 * (rubrique « أَتَكَلَّمُ / dialogue » de chaque leçon d'arabe).
 *
 * Générateur DÉTERMINISTE et PUR (aucune dépendance, aucun hasard) :
 *  - l'élève joue un personnage du dialogue ; les répliques des autres sont celles du partenaire ;
 *  - à chaque réplique de l'élève, il choisit parmi 3 phrases au plus :
 *      « bonne »     : la réplique du livre ;
 *      « presque »   : une autre réplique de la MÊME scène (bonne scène, mauvais moment) ;
 *      « reprendre » : une réplique d'un dialogue d'une leçon PRÉCÉDENTE du même niveau (déjà vue) ;
 *  - AUCUN texte arabe inventé : chaque phrase est copiée octet par octet d'une réplique des livres (balisage
 *    `[..]` compris), jamais retouchée ni normalisée ; les distracteurs ne viennent que du niveau, jamais d'une
 *    leçon à venir ;
 *  - mots nouveaux : ceux de la rubrique « mots » de la leçon présents dans le dialogue (proposés à « Mes mots »).
 * Format versionné (`v`) : un fichier par leçon, `conversation/<niveau>/<lecon>.json`.
 */
import { bare } from './text.js';

export const CONVERSATION_VERSION = 1;
/** niveaux d'arabe (enfants, ados, adultes) qui ont des scénarios ; jamais la religion ni le Coran */
export const CONV_LEVEL = /^(en|ado|ad)\d+$/;

export interface Replique {
  qui: string;
  qui_ar?: string;
  ar: string;
  fr?: string;
}
export type ChoixKind = 'bonne' | 'presque' | 'reprendre';
export interface Choix {
  ar: string;
  fr?: string;
  kind: ChoixKind;
  /** origine dans les livres : `<unité>#<indice de la réplique>` */
  src: string;
}
export type Tour =
  ({ t: 'partenaire' } & Replique) | { t: 'eleve'; qui: string; qui_ar?: string; choix: Choix[] };

export interface Scenario {
  v: number;
  id: string;
  niveau: string;
  lecon: string;
  titre_ar?: string;
  titre_fr?: string;
  /** décor de la scène (lieu du livre, objets) : aucun visage, aucun personnage dessiné */
  scene: { lieu: string; props?: string[] };
  /** personnage joué par l'élève */
  role: { qui: string; qui_ar?: string };
  tours: Tour[];
  mots: Array<{ ar: string; fr?: string; img?: string }>;
}

/** Dialogue d'une leçon tel que lu dans les livres (seuls les champs utiles). */
export interface LeconSource {
  /** identifiant d'unité, ex. `en1.l05` */
  id: string;
  lesson: {
    dialogue?: {
      titre_ar?: string;
      titre_fr?: string;
      lieu?: string;
      props?: unknown;
      repliques?: unknown;
    };
    scene?: { lieu?: string; props?: unknown };
    mots?: unknown;
  };
}

const str = (x: unknown): string | undefined => (typeof x === 'string' && x ? x : undefined);

/** Répliques utilisables d'un dialogue (texte arabe présent, pas de verset). */
export function repliquesDe(src: LeconSource): Replique[] {
  const rs = src.lesson.dialogue?.repliques;
  if (!Array.isArray(rs)) return [];
  const out: Replique[] = [];
  for (const r of rs as Array<Record<string, unknown>>) {
    const ar = str(r?.ar);
    const qui = str(r?.qui);
    if (!ar || !qui) continue;
    const x: Replique = { qui, ar };
    if (str(r.qui_ar)) x.qui_ar = str(r.qui_ar);
    if (str(r.fr)) x.fr = str(r.fr);
    // un verset dans un dialogue reste au partenaire et n'est jamais proposé comme choix (voir `choisissable`)
    if (r.verset_tanzil) (x as Replique & { verset?: true }).verset = true;
    out.push(x);
  }
  return out;
}

const choisissable = (r: Replique) => !(r as { verset?: true }).verset;

/** Hachage FNV-1a 32 bits (tirage déterministe). */
export function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Personnage joué par l'élève : celui qui parle le plus, hors celui qui ouvre la scène (le partenaire commence). */
export function roleEleve(rs: readonly Replique[]): string | null {
  const ordre: string[] = [];
  const n = new Map<string, number>();
  for (const r of rs) {
    if (!n.has(r.qui)) ordre.push(r.qui);
    n.set(r.qui, (n.get(r.qui) ?? 0) + 1);
  }
  const candidats = ordre.slice(1);
  if (!candidats.length) return null;
  let best = candidats[0]!;
  for (const q of candidats) if ((n.get(q) ?? 0) > (n.get(best) ?? 0)) best = q;
  return best;
}

const numLecon = (id: string) => Number(/\.l(\d+)$/.exec(id)?.[1] ?? NaN);

/**
 * Scénario d'une leçon. `niveau` : TOUTES les leçons du même niveau (pour les distracteurs « reprendre »,
 * pris seulement dans les leçons d'un numéro inférieur). `null` si le dialogue ne s'y prête pas.
 */
export function genererScenario(src: LeconSource, niveau: readonly LeconSource[]): Scenario | null {
  const [lv, lecon] = src.id.split('.') as [string, string];
  if (!CONV_LEVEL.test(lv) || !lecon) return null;
  const rs = repliquesDe(src);
  if (rs.length < 2) return null;
  const role = roleEleve(rs);
  if (!role) return null;
  const d = src.lesson.dialogue ?? {};
  const lieu = str(d.lieu) ?? str(src.lesson.scene?.lieu);
  if (!lieu) return null;

  // réservoir « déjà vu » : répliques des dialogues des leçons précédentes du même niveau
  const n = numLecon(src.id);
  // (avec la réplique qui la précédait : une phrase qui répondait à la MÊME question serait juste aussi)
  const vues: Array<{ r: Replique; src: string; avant: string }> = [];
  for (const o of [...niveau].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!o.id.startsWith(`${lv}.`) || !(numLecon(o.id) < n)) continue;
    const ors = repliquesDe(o);
    ors.forEach((r, i) => {
      if (choisissable(r))
        vues.push({ r, src: `${o.id}#${i}`, avant: i ? bare(ors[i - 1]!.ar) : '' });
    });
  }

  const tours: Tour[] = [];
  let nChoix = 0;
  rs.forEach((r, i) => {
    if (r.qui !== role || !choisissable(r)) {
      tours.push({ t: 'partenaire', ...stripVerset(r) });
      return;
    }
    const pris = new Set([bare(r.ar)]);
    const avant = i ? bare(rs[i - 1]!.ar) : '';
    const memeQuestion = (a: string) => !!avant && a === avant;
    const bonne: Choix = {
      ar: r.ar,
      ...(r.fr ? { fr: r.fr } : {}),
      kind: 'bonne',
      src: `${src.id}#${i}`,
    };
    const autres: Choix[] = [];
    // « presque » : une autre réplique de la même scène (la plus proche après, sinon avant)
    const memes = rs
      .map((x, j) => ({ x, j }))
      .filter(
        ({ x, j }) =>
          j !== i &&
          choisissable(x) &&
          !pris.has(bare(x.ar)) &&
          !memeQuestion(j ? bare(rs[j - 1]!.ar) : ''),
      );
    if (memes.length) {
      const h = fnv(`${src.id}#${i}#p`) % memes.length;
      const { x, j } = memes[h]!;
      pris.add(bare(x.ar));
      autres.push({
        ar: x.ar,
        ...(x.fr ? { fr: x.fr } : {}),
        kind: 'presque',
        src: `${src.id}#${j}`,
      });
    }
    // « reprendre » : une réplique d'une leçon précédente du niveau ; à défaut, une 2e de la même scène
    const pool = vues.filter((v) => !pris.has(bare(v.r.ar)) && !memeQuestion(v.avant));
    if (pool.length) {
      const v = pool[fnv(`${src.id}#${i}#r`) % pool.length]!;
      pris.add(bare(v.r.ar));
      autres.push({
        ar: v.r.ar,
        ...(v.r.fr ? { fr: v.r.fr } : {}),
        kind: 'reprendre',
        src: v.src,
      });
    } else {
      const reste = memes.filter(({ x }) => !pris.has(bare(x.ar)));
      if (reste.length) {
        const { x, j } = reste[fnv(`${src.id}#${i}#q`) % reste.length]!;
        autres.push({
          ar: x.ar,
          ...(x.fr ? { fr: x.fr } : {}),
          kind: 'presque',
          src: `${src.id}#${j}`,
        });
      }
    }
    if (!autres.length) {
      tours.push({ t: 'partenaire', ...stripVerset(r) });
      return;
    }
    // place de la bonne réponse : déterministe, variable d'une étape à l'autre
    const choix = [...autres];
    choix.splice(fnv(`${src.id}#${i}#pos`) % (autres.length + 1), 0, bonne);
    nChoix++;
    tours.push({ t: 'eleve', qui: r.qui, ...(r.qui_ar ? { qui_ar: r.qui_ar } : {}), choix });
  });
  if (!nChoix) return null;

  const roleAr = rs.find((r) => r.qui === role)?.qui_ar;
  const props = Array.isArray(d.props)
    ? (d.props as unknown[]).filter((p): p is string => typeof p === 'string')
    : undefined;
  return {
    v: CONVERSATION_VERSION,
    id: src.id,
    niveau: lv,
    lecon,
    ...(str(d.titre_ar) ? { titre_ar: str(d.titre_ar) } : {}),
    ...(str(d.titre_fr) ? { titre_fr: str(d.titre_fr) } : {}),
    scene: { lieu, ...(props?.length ? { props } : {}) },
    role: { qui: role, ...(roleAr ? { qui_ar: roleAr } : {}) },
    tours,
    mots: motsDuDialogue(src, rs),
  };
}

function stripVerset(r: Replique): Replique {
  const { qui, qui_ar, ar, fr } = r;
  return { qui, ...(qui_ar ? { qui_ar } : {}), ar, ...(fr ? { fr } : {}) };
}

/** Mots de la leçon (rubrique « mots ») qui apparaissent dans le dialogue, texte du livre inchangé. */
export function motsDuDialogue(
  src: LeconSource,
  rs: readonly Replique[] = repliquesDe(src),
): Scenario['mots'] {
  const mots = Array.isArray(src.lesson.mots)
    ? (src.lesson.mots as Array<Record<string, unknown>>)
    : [];
  const mDialogue = new Set(
    rs.flatMap((r) => bare(r.ar).split(/[\s،؟!.:؛«»"'…-]+/u)).filter(Boolean),
  );
  // un mot du livre « رُمَّانٌ » se retrouve dans « رُمَّانَةً », « وَهٰذَا »… : racine sans tanwīn ni ة finale,
  // avec ou sans préfixe و / ف / ب / ال
  const formes = (w: string) => {
    const b = bare(w).replace(/[اة]$/u, '');
    return [b, `ال${b}`];
  };
  const present = (w: string) => {
    const fs = formes(w);
    for (const m of mDialogue) {
      const m2 = m.replace(/^[وفب]/u, '');
      for (const f of fs) if (f.length >= 2 && (m.startsWith(f) || m2.startsWith(f))) return true;
    }
    return false;
  };
  const out: Scenario['mots'] = [];
  for (const m of mots) {
    const ar = str(m?.ar);
    if (!ar || !present(ar)) continue;
    out.push({
      ar,
      ...(str(m.fr) ? { fr: str(m.fr) } : {}),
      ...(str(m.img) ? { img: str(m.img) } : {}),
    });
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * Contrôle d'un scénario contre les livres (tests, `--check`) : chaque phrase arabe est une réplique d'un
 * dialogue du MÊME niveau, d'une leçon de numéro inférieur ou égal ; la bonne réponse est la réplique du livre
 * à cet endroit. Renvoie la liste des écarts (vide = conforme).
 */
export function verifierScenario(s: Scenario, niveau: readonly LeconSource[]): string[] {
  const errs: string[] = [];
  const n = numLecon(s.id);
  const parSrc = new Map<string, Replique>();
  const autorises = new Set<string>();
  for (const o of niveau) {
    if (!o.id.startsWith(`${s.niveau}.`) || numLecon(o.id) > n) continue;
    repliquesDe(o).forEach((r, i) => {
      parSrc.set(`${o.id}#${i}`, r);
      autorises.add(r.ar);
    });
  }
  if (s.v !== CONVERSATION_VERSION) errs.push(`${s.id} : version ${s.v}`);
  for (const t of s.tours) {
    if (t.t === 'partenaire') {
      if (!autorises.has(t.ar)) errs.push(`${s.id} : réplique hors livre « ${t.ar} »`);
      continue;
    }
    const bonnes = t.choix.filter((c) => c.kind === 'bonne');
    if (bonnes.length !== 1) errs.push(`${s.id} : ${bonnes.length} bonnes réponses`);
    if (t.choix.length < 2) errs.push(`${s.id} : moins de 2 choix`);
    if (new Set(t.choix.map((c) => bare(c.ar))).size !== t.choix.length)
      errs.push(`${s.id} : choix en double`);
    for (const c of t.choix) {
      const r = parSrc.get(c.src);
      if (!r || r.ar !== c.ar) errs.push(`${s.id} : phrase hors livre ou hors niveau « ${c.ar} »`);
      if (c.kind === 'bonne' && !c.src.startsWith(`${s.id}#`))
        errs.push(`${s.id} : bonne réponse d'une autre leçon`);
      if (c.kind === 'reprendre' && !(numLecon(c.src.split('#')[0]!) < n))
        errs.push(`${s.id} : distracteur d'une leçon non encore vue`);
    }
  }
  return errs;
}

/** Texte JSON d'un fichier de scénario (une ligne par tour : diff lisibles). */
export function scenarioJson(s: Scenario): string {
  const { tours, ...tete } = s;
  const head = JSON.stringify(tete).slice(0, -1);
  return `${head},"tours":[\n${tours.map((t) => JSON.stringify(t)).join(',\n')}\n]}\n`;
}
