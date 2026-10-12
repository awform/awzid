/**
 * Madjaliss — quiz d'une séance, GÉNÉRÉ AUTOMATIQUEMENT et seulement à partir des données du texte (aucune question
 * rédigée à la main, aucune question religieuse inventée) : 3 à 5 questions de trois sortes :
 *  - « traduction » : retrouver la traduction d'une phrase de la séance (les autres choix sont des traductions
 *    d'autres phrases du même texte) ;
 *  - « compléter » : retrouver le mot qui manque dans une phrase de la séance (les autres choix sont des mots
 *    d'autres phrases du texte) ;
 *  - « mot » : retrouver le sens d'un mot difficile de la séance (les autres choix sont des sens d'autres mots).
 * Jamais de question sur un passage montré avec son explication (AKH-0052), une citation du Coran ou d'un hadith,
 * un titre ou une formule ; jamais de « compléter » dans une phrase dont la vocalisation est à vérifier.
 * Tirage déterministe (graine) : la même séance donne le même quiz, une nouvelle graine en donne un autre.
 */
import { arSimple, type Matn, type Phrase } from './donnees';

export type Question =
  | { type: 'traduction'; phrase: string; ar: string; options: string[]; bonne: number }
  | {
      type: 'completer';
      phrase: string;
      avant: string;
      apres: string;
      options: string[];
      bonne: number;
    }
  | { type: 'mot'; ar: string; options: string[]; bonne: number };

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function hasard(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const melanger = <T>(xs: readonly T[], r: () => number): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

/** Lettres seules (sans voyelles, signes ni ponctuation) : pour comparer deux mots. */
export const squelette = (w: string) => w.replace(/[^ء-غف-يٱ]/g, '');
const PONCT = /[،؛:.!؟«»()،]+$/;

/** Phrase utilisable en quiz : texte de l'auteur, traduit, sans citation ni passage réservé. */
export const questionnable = (p: Phrase): boolean =>
  p.t === 'texte' && !p.explication && arSimple(p) !== null && !!p.fr;

/** Rangs des mots qu'on peut faire compléter : pas le premier, au moins 3 lettres, jamais le nom d'Allah. */
export function motsACompleter(ar: string): number[] {
  const mots = ar.split(' ');
  return mots
    .map((w, i) => ({ i, s: squelette(w.replace(PONCT, '')) }))
    .filter(({ i, s }) => i > 0 && s.length >= 3 && !/لله|اله$/.test(s))
    .map(({ i }) => i);
}

function choix<T>(bonne: T, autres: readonly T[], r: () => number, n = 3) {
  const options = melanger([bonne, ...autres.slice(0, n - 1)], r);
  return { options, bonne: options.indexOf(bonne) };
}

export function genererQuiz(m: Matn, n: number, graine = n): Question[] {
  const r = hasard(graine * 7919 + n);
  const seance = m.seances.find((s) => s.n === n);
  if (!seance) return [];
  const de = new Map(m.phrases.map((p) => [p.id, p]));
  const ici = seance.phrases
    .map((id) => de.get(id))
    .filter((p): p is Phrase => !!p && questionnable(p));
  // autres choix tirés des séances VOISINES (même chapitre ou presque) ; jamais d'une séance réservée aux ados et
  // adultes (règles, lochies) quand la séance ne l'est pas elle-même
  const voisines = (ecart: number) =>
    m.seances.filter(
      (s) => s.n !== n && Math.abs(s.n - n) <= ecart && (!s.pudeur || !!seance.pudeur),
    );
  const proches = [4, 8, 44]
    .map(voisines)
    .find(
      (ss) => ss.flatMap((s) => s.phrases).filter((id) => questionnable(de.get(id)!)).length >= 6,
    )!;
  const ailleurs = proches
    .flatMap((s) => s.phrases)
    .map((id) => de.get(id)!)
    .filter((p) => questionnable(p));

  const traduction = (p: Phrase): Question | null => {
    const autres = melanger([...new Set(ailleurs.map((x) => x.fr!).filter((f) => f !== p.fr))], r);
    if (autres.length < 2) return null;
    return { type: 'traduction', phrase: p.id, ar: arSimple(p)!, ...choix(p.fr!, autres, r) };
  };
  const completer = (p: Phrase): Question | null => {
    if (p.incertain) return null;
    const ar = arSimple(p)!;
    const rangs = motsACompleter(ar);
    if (!rangs.length) return null;
    const mots = ar.split(' ');
    const i = rangs[Math.floor(r() * rangs.length)]!;
    const brut = mots[i]!;
    const fin = PONCT.exec(brut)?.[0] ?? '';
    const mot = brut.slice(0, brut.length - fin.length);
    const ici_ = new Set(mots.map((w) => squelette(w)));
    const autres = melanger(
      [
        ...new Set(
          ailleurs
            .filter((x) => !x.incertain)
            .flatMap((x) =>
              arSimple(x)!
                .split(' ')
                .map((w) => w.replace(PONCT, '')),
            )
            .filter((w) => squelette(w).length >= 3 && !ici_.has(squelette(w))),
        ),
      ],
      r,
    );
    if (autres.length < 2) return null;
    return {
      type: 'completer',
      phrase: p.id,
      avant: mots.slice(0, i).join(' '),
      apres: `${fin}${i + 1 < mots.length ? ' ' : ''}${mots.slice(i + 1).join(' ')}`,
      ...choix(mot, autres, r),
    };
  };
  const tousMots = proches.flatMap((s) => s.mots);
  const motQ = (k: number): Question | null => {
    const w = seance.mots[k];
    if (!w) return null;
    const autres = melanger([...new Set(tousMots.map((x) => x.fr).filter((f) => f !== w.fr))], r);
    if (autres.length < 2) return null;
    return { type: 'mot', ar: w.ar, ...choix(w.fr, autres, r) };
  };

  const phrases = melanger(ici, r);
  const motsOrdre = melanger(
    seance.mots.map((_, k) => k),
    r,
  );
  // traduction, compléter, mot, puis on recommence, en changeant de phrase quand c'est possible
  const out: Question[] = [];
  const vus = new Set<string>();
  let ip = 0;
  let im = 0;
  for (let tour = 0; tour < 4 && out.length < 5; tour++) {
    for (const sorte of ['traduction', 'completer', 'mot'] as const) {
      if (out.length >= 5) break;
      let q: Question | null = null;
      if (sorte === 'mot') q = motQ(motsOrdre[im++] ?? -1);
      else
        for (let essai = 0; essai < phrases.length && !q; essai++) {
          const p = phrases[(ip + essai) % phrases.length]!;
          const k = `${sorte}:${p.id}`;
          if (vus.has(k)) continue;
          q = sorte === 'traduction' ? traduction(p) : completer(p);
          if (q) {
            vus.add(k);
            ip = (ip + essai + 1) % Math.max(1, phrases.length);
          }
        }
      if (q) out.push(q);
    }
  }
  return out;
}
