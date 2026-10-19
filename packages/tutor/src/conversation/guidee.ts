/**
 * ÉTAGE 1 — « Conversation guidée » (local, gratuit, AUCUN modèle de langage) : l'élève joue son rôle dans le
 * dialogue de sa leçon ; l'IA LOCALE (ecoute-ia, NeMo FastConformer) transcrit ce qu'il dit ; on compare à la
 * réplique ATTENDUE du livre, mot par mot.
 *
 * Règle d'A5 reprise : mieux vaut se taire qu'accuser à tort. Un mot n'est dit « manquant » que si la réplique a
 * été bien entendue par ailleurs ; un mot mal reconnu ou peu sûr est « à revoir » (doute), jamais une faute ;
 * trop peu reconnu : « je n'ai pas bien entendu, réessaie ».
 */
import { bareWords } from '../arabic.js';

export interface MotEntenduSimple {
  w: string;
  /** confiance de la reconnaissance (0-1) ; 1 pour un texte écrit */
  conf: number;
}
export type EtatMot = 'juste' | 'doute' | 'manquant';
export interface ResultatGuidee {
  /** mots de la réplique attendue (forme du livre, vocalisée) avec leur état */
  mots: Array<{ ar: string; etat: EtatMot }>;
  /** « bravo » : tout juste ; « presque » : quelques mots à revoir ; « reessaie » : pas assez entendu */
  bilan: 'bravo' | 'presque' | 'reessaie';
  justes: number;
  total: number;
  /** mots dits en plus (comptés, jamais montrés comme fautes) */
  ajouts: number;
}

export const SEUIL_CONF = 0.6;

/** Mots du livre (balisage [..] retiré, ponctuation séparée), forme écrite gardée pour l'affichage. */
export function motsDuLivre(ar: string): string[] {
  return ar
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/[\s،؟!.:؛«»"'…,?()-]+/u)
    .filter((w) => bareWords(w).length > 0);
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[a.length]![b.length]!;
}

/** 2 : identique ; 1 : proche (lettre voisine, article) ; 0 : différent. */
function proximite(attendu: string, entendu: string): 0 | 1 | 2 {
  if (attendu === entendu) return 2;
  const sansAl = (w: string) => w.replace(/^ال/, '');
  if (sansAl(attendu) === sansAl(entendu)) return 1;
  const n = Math.max(attendu.length, entendu.length);
  if (n >= 4 && lev(attendu, entendu) <= 1) return 1;
  return 0;
}

/** Compare ce qui a été dit (ou écrit) à la réplique attendue (alignement par programmation dynamique). */
export function comparerReplique(
  attendue: string,
  entendus: readonly MotEntenduSimple[],
): ResultatGuidee {
  const affichage = motsDuLivre(attendue);
  const E = affichage.map((w) => bareWords(w).join(''));
  const H = entendus.flatMap((m) => bareWords(m.w).map((b) => ({ b, conf: m.conf })));
  const n = E.length;
  const m = H.length;
  // score d'alignement : 2 par mot identique, 1 par mot proche
  const S = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const p = proximite(E[i - 1]!, H[j - 1]!.b);
      S[i]![j] = Math.max(S[i - 1]![j]!, S[i]![j - 1]!, p ? S[i - 1]![j - 1]! + p : -1);
    }
  const etat: EtatMot[] = Array<EtatMot>(n).fill('manquant');
  let i = n;
  let j = m;
  let apparies = 0;
  while (i > 0 && j > 0) {
    const p = proximite(E[i - 1]!, H[j - 1]!.b);
    if (p && S[i]![j] === S[i - 1]![j - 1]! + p) {
      etat[i - 1] = p === 2 && H[j - 1]!.conf >= SEUIL_CONF ? 'juste' : 'doute';
      apparies++;
      i--;
      j--;
    } else if (S[i - 1]![j]! >= S[i]![j - 1]!) i--;
    else j--;
  }
  const justes = etat.filter((e) => e === 'juste').length;
  const ajouts = Math.max(0, m - apparies);
  // trop peu reconnu : on ne montre AUCUN mot manquant (ce serait peut-être faux)
  const entendu = n === 0 ? 0 : apparies / n;
  if (entendu < 0.5) {
    return {
      mots: affichage.map((ar) => ({ ar, etat: 'doute' as const })),
      bilan: 'reessaie',
      justes,
      total: n,
      ajouts,
    };
  }
  return {
    mots: affichage.map((ar, k) => ({ ar, etat: etat[k]! })),
    bilan: justes === n ? 'bravo' : 'presque',
    justes,
    total: n,
    ajouts,
  };
}

/** Texte écrit par l'élève (mode texte de secours) : mots sûrs. */
export const motsEcrits = (texte: string): MotEntenduSimple[] =>
  motsDuLivre(texte).map((w) => ({ w, conf: 1 }));
