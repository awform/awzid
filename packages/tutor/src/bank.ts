/**
 * Banque d'explications VALIDÉES (ARCHITECTURE_V2 § 1.4), locale d'abord : extraite de la projection
 * ÉLÈVE des leçons de livres GELÉS (objectifs, « je découvre », « je retiens », lettres et leurs points,
 * mots et leur sens). Jamais le bloc Coran de la leçon (ses versets ne passent que par référence).
 * Les reformulations proposées plus tard par un modèle arriveront au statut « proposee » et ne serviront
 * qu'après relecture humaine.
 */
import type { Explanation } from './types.js';

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const arr = (v: unknown) => (Array.isArray(v) ? (v as Obj[]) : []);
/** crochets de couleur des livres ([ر]) : retirés pour l'affichage du tuteur */
const plain = (s: string) => s.replace(/[[\]]/g, '');

export function buildBank(unitId: string, lesson: unknown): Explanation[] {
  const L = (lesson ?? {}) as Obj;
  const out: Explanation[] = [];
  const add = (id: string, notion: string, texteFr: string, ar = '', source = 'leçon') => {
    if (!texteFr) return;
    out.push({
      id: `${unitId}.${id}`,
      notion,
      texteFr: plain(texteFr),
      ...(ar ? { ar: plain(ar) } : {}),
      source: `${unitId} (${source})`,
      statut: 'valide',
    });
  };
  arr(L.retiens).forEach((r, i) =>
    add(`retiens${i + 1}`, 'regle', str(r.fr), str(r.ar), 'je retiens'),
  );
  arr(L.lettres).forEach((l, i) => {
    const pts = str(l.points_fr);
    add(
      `lettre${i + 1}`,
      `lettre ${str(l.l)}`,
      `${str(l.nom_fr) || `La lettre ${str(l.l)}`}${pts ? ` : ${pts}` : ''}. Ses formes : ${arr(
        l.formes as unknown,
      )
        .map(String)
        .join(' ')}.`,
      str(l.l),
      'je découvre',
    );
  });
  if (str(L.decouvre_fr))
    add('decouvre', 'decouverte', str(L.decouvre_fr), str(L.decouvre_ar), 'je découvre');
  if (str(L.notion)) add('notion', 'notion', str(L.notion), '', 'notion');
  arr(L.objectifs).forEach((o, i) =>
    add(`objectif${i + 1}`, 'objectif', str(o.fr), str(o.ar), 'objectifs'),
  );
  arr(L.mots)
    .slice(0, 40)
    .forEach((m, i) => {
      const ar = str(m.ar);
      const fr = str(m.fr);
      if (ar && fr)
        add(
          `mot${i + 1}`,
          `mot ${plain(ar)}`,
          `Le mot ${plain(ar)} veut dire « ${fr} ».`,
          ar,
          'mes mots',
        );
    });
  return out;
}

/** Recherche simple (mots communs) dans la banque ; la plus pertinente d'abord. */
export function searchBank(bank: readonly Explanation[], query: string): Explanation[] {
  const q = tokens(query);
  if (!q.size) return [];
  return bank
    .map((e) => {
      const t = tokens(`${e.notion} ${e.texteFr} ${e.ar ?? ''}`);
      let score = 0;
      for (const w of q) if (t.has(w)) score++;
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.e);
}

const STOP = new Set(
  'le la les un une des de du et ou à au aux en est que qui quoi comment pourquoi je tu il elle ce cette ces mon ma mes ton ta tes veut dire explique moi ne pas lettre mot'.split(
    ' ',
  ),
);
function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[\s,.;:!?«»"'()[\]]+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}
