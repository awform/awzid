/**
 * Chantier A37 — classement des rubriques des livres par CERCLE et par LIEU (côté serveur).
 *
 * Première classification AUTOMATIQUE et PRUDENTE par mots-clés français (titre, introduction, points du livre),
 * en attendant l'index officiel des livres (`data/akhlaq/index-adab.json`), qui la remplace entrée par entrée.
 * Entre les deux, `ADAB_CORRECTIONS` corrige à la main une entrée mal rangée. Prudence :
 *  - un mot du TITRE compte 3, un mot du texte 1 ; un cercle n'est retenu qu'à partir de 3 (un mot du titre, ou
 *    trois mentions dans le texte) ; au plus 3 cercles et 3 lieux, les plus forts d'abord ;
 *  - « Allah » seul ne range rien (il est dans presque toutes les rubriques) : le cercle « Allah et le Prophète ﷺ »
 *    se fonde sur les actes d'adoration (prière, ablutions, Coran, invocation…) ;
 *  - « Époux » et « Enfants » (éducation) ne sont proposés que pour les livres des adultes (ad*, ra*) ;
 *  - aucun cercle trouvé : « Soi » (bon comportement personnel), ou « Allah et le Prophète ﷺ » pour le fiqh.
 * Le texte des livres n'est jamais modifié : la normalisation (minuscules, accents retirés) sert à comparer.
 */
import type { AdabEntry, CercleId, LieuId, Rangement } from './adab.js';
import { isCercle, isLieu } from './adab.js';

type Rule<T extends string> = readonly [T, RegExp];

// mots-clés sur un texte normalisé (minuscules, sans accents, apostrophes droites)
const CERCLE_RULES: ReadonlyArray<Rule<CercleId>> = [
  [
    'soi',
    /\b(propre(te)?|hygiene|se lav\w*|lave(r)? (les|mes|ses) mains|dents|siwak|vetements?|habits?|pudeur|colere|patience|patient|humilite|orgueil|intention|sincer\w*|mensonges?|menti\w*|jalousie|envie|tenue|ranger|rangement|sante|corps)\b/g,
  ],
  [
    'allah_prophete',
    /\b(priere|prieres|prier|salat|ablutions?|wudu|coran|recit\w*|invocations?|invoquer|douas?|du'as?|dhikr|rappel d'allah|bismillah|basmala|louange|al-?hamdu|jeune|jeuner|ramadan|prophete|sunna|repentir|pardon d'allah|adorer|adoration|foi)\b/g,
  ],
  ['parents', /\b(parents?|pere|mere|papa|maman|bienfaisance envers)\b/g],
  [
    'fratrie',
    /\b(freres? et (les )?s(oe|œ)urs?|mon frere|ma s(oe|œ)ur|mes freres|mes s(oe|œ)urs|fratrie)\b/g,
  ],
  ['epoux', /\b(epoux|epouse|conjoints?|mari|mariage|couple|vie conjugale)\b/g],
  ['enfants', /\b(enfants?|eduquer|education)\b/g],
  [
    'famille',
    /\b(famille|familial\w*|grand-pere|grand-mere|grands-parents|oncles?|tantes?|cousins?|cousines?|liens? de (parente|famille|sang)|proches)\b/g,
  ],
  ['voisins', /\b(voisins?|voisine|voisinage)\b/g],
  ['amis', /\b(amis?|amie|amies|amitie|camarades?|copains?|copines?|compagnons?)\b/g],
  [
    'ecole',
    /\b(ecole|classe|maitre|maitresse|enseignants?|professeurs?|eleves?|etudier|etude|cartable|cahier|apprendre le savoir|chercher la science)\b/g,
  ],
  [
    'travail',
    /\b(travail|travailler|metier|collegues?|employeur|salaire|commerce|commercant|vendre|vente|acheter|achat|marchand\w*|dettes?)\b/g,
  ],
  [
    'autorites',
    /\b(lois?|societe|citoyen\w*|justice|regles? de (la )?vie|pays|autorites?|police|temoignage|promesses?|engagements?|depot)\b/g,
  ],
  ['espace_public', /\b(rue|routes?|trottoir|passants?|dehors|en ville)\b/g],
  [
    'fragiles',
    /\b(malades?|maladie|pauvres?|orphelins?|personnes? agees?|vieillards?|handicap\w*|faibles?|necessiteux|mendiants?|invalides?|veuves?)\b/g,
  ],
  ['musulmans_avis', /\b(musulmans?|musulmane|oumma|umma|communaute|fraternite)\b/g],
  [
    'autres_religions',
    /\b(non-musulmans?|chretiens?|juifs?|autres (religions|cultures|croyances)|toutes les religions|gens du livre)\b/g,
  ],
  [
    'animaux_nature',
    /\b(animaux|animal|chats?|chiens?|oiseaux?|fourmis?|chevaux|cheval|moutons?|plantes?|arbres?|nature|environnement|gaspill\w*)\b/g,
  ],
  [
    'numerique',
    /\b(telephones?|portables?|ecrans?|reseaux?( sociaux)?|internet|videos?|jeux video|tablettes?|en ligne)\b/g,
  ],
];

const LIEU_RULES: ReadonlyArray<Rule<LieuId>> = [
  ['maison', /\b(maison|foyer|chez (moi|lui|elle|nous|soi)|demander la permission|domicile)\b/g],
  ['chambre', /\b(chambre|lit|dormir|sommeil|coucher|se coucher|reveil|se reveiller)\b/g],
  ['cuisine', /\b(repas|manger|boire|mange|nourriture|table|cuisine|plats?|aliments?)\b/g],
  ['toilettes', /\b(toilettes|wc|besoins? naturels?|istinja|se soulager)\b/g],
  ['mosquee', /\b(mosquee|mosquees|masjid)\b/g],
  ['ecole', /\b(ecole|classe|cartable)\b/g],
  ['rue', /\b(rue|routes?|trottoir|passants?|au marche)\b/g],
  ['transports', /\b(bus|voiture|train|metro|transports?|voyages?|voyager|monture|avion)\b/g],
  ['travail', /\b(travail|bureau|collegues?|lieu de travail)\b/g],
];

/** Texte normalisé pour la comparaison seulement (le texte du livre n'est jamais modifié). */
const PLAIN: Record<string, string> = {
  a: 'àâäáãāå',
  c: 'ç',
  d: 'ḍ',
  e: 'éèêëē',
  h: 'ḥ',
  i: 'îïíìī',
  o: 'ôöóòōõ',
  s: 'ṣš',
  t: 'ṭ',
  u: 'ùûüúū',
  y: 'ÿ',
  z: 'ẓ',
  oe: 'œ',
  ae: 'æ',
};
const TO_PLAIN = new Map(
  Object.entries(PLAIN).flatMap(([to, from]) => [...from].map((c) => [c, to])),
);
const ACCENTED = new RegExp(`[${Object.values(PLAIN).join('')}]`, 'g');

/**
 * Texte français ramené à des minuscules sans accents, POUR LA COMPARAISON SEULEMENT (le texte du livre n'est
 * jamais modifié ; aucune normalisation Unicode, règle du dépôt).
 */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(ACCENTED, (c) => TO_PLAIN.get(c) ?? c)
    .replace(/[’ʼ`]/g, "'");
}

/** Expressions trompeuses retirées avant la comparaison (« école mālikite » n'est pas l'école des enfants…). */
const FAUX_AMIS =
  /\b(ecoles? (juridiques?|malikites?|hanafites?|chafi'?ites?|shafi'?ites?|hanbalites?|de l'imam \w+)|chemin d'allah|nature originelle)\b/g;

function score<T extends string>(
  rules: ReadonlyArray<Rule<T>>,
  title: string,
  body: string,
): Map<T, number> {
  const out = new Map<T, number>();
  for (const [id, re] of rules) {
    const n = (title.match(re)?.length ?? 0) * 3 + (body.match(re)?.length ?? 0);
    if (n) out.set(id, n);
  }
  return out;
}

const best = <T extends string>(m: Map<T, number>, min: number, max: number) =>
  [...m.entries()]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([id]) => id);

/** Classement automatique d'un bloc (titre + textes français). */
export function classifyAdab(input: {
  titre_fr: string;
  textes: readonly string[];
  level: string;
  code: AdabEntry['code'];
}): { cercles: CercleId[]; lieux: LieuId[] } {
  const title = norm(input.titre_fr).replace(FAUX_AMIS, ' ');
  const body = norm(input.textes.join(' \n ')).replace(FAUX_AMIS, ' ');
  const adult = /^(ad|ra)\d/.test(input.level);
  const sc = score(CERCLE_RULES, title, body);
  if (!adult) {
    sc.delete('epoux');
    sc.delete('enfants');
  } else if ((sc.get('enfants') ?? 0) < 3) sc.delete('enfants');
  // « mère », « père » d'une fratrie ou d'un époux : la fratrie et les époux restent ; les parents aussi
  let cercles = best(sc, 3, 3);
  if (!cercles.length) cercles = [input.code === 'fiqh' ? 'allah_prophete' : 'soi'];
  const lieux = best(score(LIEU_RULES, title, body), 2, 3);
  return { cercles, lieux };
}

// ---------------------------------------------------------------- rubriques d'une leçon

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown) => (typeof x === 'string' ? x : '');

/** Chaînes françaises d'un bloc (clés `fr`, `*_fr`), hors guide de l'enseignant et sources. */
function frenchTexts(x: unknown, out: string[] = [], key = ''): string[] {
  if (typeof x === 'string') {
    if (key === 'fr' || (key.endsWith('_fr') && !/^(guide|sources|malikite)_fr$/.test(key)))
      out.push(x);
  } else if (Array.isArray(x)) for (const y of x) frenchTexts(y, out, key);
  else if (isObj(x))
    for (const [k, v] of Object.entries(x)) if (k !== 'divergences') frenchTexts(v, out, k);
  return out;
}

/** Points « Je … » qui sont des objectifs d'étude (citer, expliquer, réviser…), pas des défis de comportement. */
const NON_DEFI =
  /^(je (cite|sais|connais|peux|revise|nomme|definis|distingue|donne|compare|explique|resume|reconnais|recite|dis dans l'ordre|lis|ecris|traduis)|j'(explique|identifie|enumere|apprends))\b|\(lecon/;

/** Premier point « Je … » du bloc (défi possible), recopié tel quel ; jamais un verset ni une citation. */
function defiOf(block: Obj): AdabEntry['defi'] {
  const lists = [block.points, block.retiens].filter(Array.isArray) as unknown[][];
  for (const list of lists)
    for (const p of list) {
      if (!isObj(p) || p.verset_tanzil) continue;
      const fr = str(p.fr).trim();
      const n = norm(fr);
      if (!/^(je |j')/.test(n) || fr.length > 160 || /[«»"]/.test(fr) || NON_DEFI.test(n)) continue;
      const ar = str(p.ar).trim();
      return ar ? { ar, fr } : { fr };
    }
  return undefined;
}

export const SCIENCE_CODES = ['adab', 'fiqh', 'usra', 'muamalat'] as const;

/**
 * Rubriques de bon comportement d'une leçon (projection élève) : le bloc `fiqh_adab` des leçons de langue et les
 * rubriques `adab`, `fiqh`, `usra`, `muamalat` des leçons de sciences.
 */
export function entriesOfLesson(
  unit: string,
  level: string,
  n: number,
  lesson: unknown,
): AdabEntry[] {
  if (!isObj(lesson)) return [];
  const out: AdabEntry[] = [];
  const add = (path: string, code: AdabEntry['code'], b: Obj) => {
    const titre_fr = str(b.titre_fr);
    const textes = frenchTexts(b);
    const { cercles, lieux } = classifyAdab({ titre_fr, textes, level, code });
    const defi = defiOf(b);
    const situations = Array.isArray(b.situations) ? b.situations.length : 0;
    out.push({
      id: `${unit}.${path}`,
      unit,
      level,
      n,
      path,
      code,
      titre_fr,
      titre_ar: str(b.titre_ar),
      cercles,
      lieux,
      rangement: 'auto',
      ...(defi ? { defi } : {}),
      ...(situations ? { situations } : {}),
    });
  };
  if (isObj(lesson.fiqh_adab)) add('fiqh_adab', 'fiqh_adab', lesson.fiqh_adab);
  if (Array.isArray(lesson.rubriques))
    lesson.rubriques.forEach((r, i) => {
      if (isObj(r) && (SCIENCE_CODES as readonly string[]).includes(str(r.code)))
        add(`rubriques.${i}`, str(r.code) as AdabEntry['code'], r);
    });
  return out;
}

// ---------------------------------------------------------------- corrections et index officiel

export interface Rangee {
  cercles?: string[];
  lieux?: string[];
}

/**
 * Corrections MANUELLES du classement automatique (identifiant de rubrique → cercles et/ou lieux), en attendant
 * l'index officiel. Une correction remplace seulement ce qu'elle donne (cercles, lieux ou les deux).
 */
export const ADAB_CORRECTIONS: Readonly<Record<string, Rangee>> = {};

/** Rubrique de l'index officiel des livres (champs utiles à l'application). */
export interface IndexRow {
  id: string;
  unit: string;
  titre_fr: string;
  cercles: string[];
  lieux: string[];
  fiches: string[];
}

/**
 * Index officiel des livres (`data/akhlaq/index-adab.json`, format « awzid-akhlaq-index », chantier B9) :
 * `{ rubriques: [{ id: "<livre>.<lNN>.adab" | "<livre>.<lNN>.r<k>", livre, lecon, titre_fr, cercle,
 * cercles_lies, lieux, fiches }] }`. Accepte aussi la forme réduite gardée par l'import (`IndexRow[]`).
 * Les identifiants inconnus de cercle ou de lieu sont signalés et ignorés.
 */
export function readAdabIndex(raw: unknown): { rows: IndexRow[]; problems: string[] } {
  const problems: string[] = [];
  const list = isObj(raw) && Array.isArray(raw.rubriques) ? raw.rubriques : [];
  if (!list.length) problems.push('index vide ou illisible');
  const rows: IndexRow[] = [];
  for (const r of list) {
    const id = isObj(r) ? str(r.id) : '';
    const m = /^([a-z]{2,4}\d{1,2}\.l\d{2})\.(adab|r\d+|fiqh_adab|rubriques\.\d+)$/.exec(id);
    if (!isObj(r) || !m) {
      problems.push(`rubrique sans identifiant valable : ${JSON.stringify(id)}`);
      continue;
    }
    const ids = (k: string, ok: (x: unknown) => boolean) => {
      const v = (Array.isArray(r[k]) ? r[k] : typeof r[k] === 'string' ? [r[k]] : []) as unknown[];
      for (const x of v) if (!ok(x)) problems.push(`${id} : ${k} « ${String(x)} » inconnu`);
      return v.filter(ok) as string[];
    };
    rows.push({
      id,
      unit: m[1]!,
      titre_fr: str(r.titre_fr),
      cercles: [
        ...new Set([
          ...ids('cercle', isCercle),
          ...ids('cercles_lies', isCercle),
          ...ids('cercles', isCercle),
        ]),
      ],
      lieux: ids('lieux', isLieu),
      fiches: ids('fiches', (x) => typeof x === 'string'),
    });
  }
  return { rows, problems };
}

const titleKey = (unit: string, titre: string) =>
  `${unit}|${norm(titre).replace(/\s+/g, ' ').trim()}`;

/**
 * Range les rubriques : avec l'index officiel, SEULES ses rubriques sont gardées, rangées comme il le dit (repérées
 * par leçon et titre, sinon par identifiant : `.adab` = bloc `fiqh_adab`, `.r<k>` = k-ième rubrique) ; sans index,
 * classement automatique et corrections manuelles. `unmatched` : rubriques de l'index introuvables dans les leçons.
 */
export function applyRangement(
  entries: readonly AdabEntry[],
  index: readonly IndexRow[] | null,
  corrections: Readonly<Record<string, Rangee>> = ADAB_CORRECTIONS,
): { entries: AdabEntry[]; unmatched: string[] } {
  if (!index?.length)
    return {
      entries: entries.map((e) => {
        const r = corrections[e.id];
        return r
          ? {
              ...e,
              cercles: (r.cercles ?? e.cercles).filter(isCercle),
              lieux: (r.lieux ?? e.lieux).filter(isLieu),
              rangement: 'correction' as Rangement,
            }
          : e;
      }),
      unmatched: [],
    };
  const byTitle = new Map(entries.map((e) => [titleKey(e.unit, e.titre_fr), e]));
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out: AdabEntry[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  for (const r of index) {
    const k = /\.r(\d+)$/.exec(r.id)?.[1];
    const guess = r.id.endsWith('.adab')
      ? `${r.unit}.fiqh_adab`
      : k
        ? `${r.unit}.rubriques.${Number(k) - 1}`
        : r.id;
    const e = byTitle.get(titleKey(r.unit, r.titre_fr)) ?? byId.get(guess);
    if (!e || seen.has(e.id)) {
      unmatched.push(r.id);
      continue;
    }
    seen.add(e.id);
    out.push({
      ...e,
      cercles: r.cercles.filter(isCercle),
      lieux: r.lieux.filter(isLieu),
      rangement: 'index',
      ...(r.fiches.length ? { fiches: r.fiches } : {}),
    });
  }
  return { entries: out, unmatched };
}
