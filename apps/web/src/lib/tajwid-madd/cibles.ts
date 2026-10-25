/**
 * Indication des madd (25/10/2026, interrupteur `tajwid_madd`) : les madd d'un verset, d'après les annotations de tajwīd déjà livrées
 * (`@awform/content/tajwid`, source sous licence libre). Seuls les madd LONGS sont proposés : muttaṣil (`madd_muttasil`) et lāzim
 * (`madd_6`). Les autres (ṭabīʿī, munfaṣil, ʿāriḍ) comptent dans `n` (contrôle de correspondance côté service) mais ne sont jamais
 * proposés ni jugés. Rien n'est inventé : le rang `k` et le total `n` viennent des annotations.
 */
import { runsOf, type TajwidRule, type TajwidSura } from '@awform/content/tajwid';

export type TypeMadd = 'muttasil' | 'lazim';
export interface Cible {
  /** rang du madd parmi TOUS les madd annotés du verset (0 = premier) */
  k: number;
  type: TypeMadd;
  /** mot du verset (texte Tanzil, tel quel) qui porte le madd */
  mot: string;
}
export interface CiblesVerset {
  /** nombre de madd annotés dans le verset (toutes catégories) */
  n: number;
  cibles: Cible[];
}

const MADD: ReadonlySet<TajwidRule> = new Set<TajwidRule>([
  'madd_2',
  'madd_246',
  'madd_munfasil',
  'madd_muttasil',
  'madd_6',
]);
const LONG: Partial<Record<TajwidRule, TypeMadd>> = { madd_muttasil: 'muttasil', madd_6: 'lazim' };

/** Madd d'un verset ; null si le verset n'a pas d'annotation fiable ou aucun madd long. */
export function ciblesDe(
  text: string,
  entry: readonly (string | number)[] | undefined,
): CiblesVerset | null {
  const runs = runsOf(text, entry);
  if (!runs) return null;
  const mots: Array<[number, number]> = [];
  let d = 0;
  for (const w of text.split(' ')) {
    mots.push([d, d + w.length]);
    d += w.length + 1;
  }
  const cibles: Cible[] = [];
  let k = 0;
  let pos = 0;
  for (const r of runs) {
    if (r.r && MADD.has(r.r)) {
      const type = LONG[r.r];
      if (type) {
        const m = mots.find(([a, b]) => pos >= a && pos < b);
        if (m) cibles.push({ k, type, mot: text.slice(m[0], m[1]) });
      }
      k++;
    }
    pos += r.t.length;
  }
  return cibles.length ? { n: k, cibles } : null;
}

export type Indication = 'trop_court' | null;

/** Annotations de tajwid d'UNE sourate (fichier statique /tajwid/NNN.json) ; null si indisponible. Fonction en ligne : rien n'est gardé. */
export async function chargerTajwid(s: number): Promise<TajwidSura | null> {
  try {
    const r = await fetch(`/tajwid/${String(s).padStart(3, '0')}.json`);
    if (!r.ok) return null;
    const d = (await r.json()) as TajwidSura;
    return d?.v === 1 && d.s === s && Array.isArray(d.a) ? d : null;
  } catch {
    return null;
  }
}

/** Envoie la récitation d'UN verset (déjà enregistrée en mémoire) et rend l'indication du service, ou un code d'erreur. */
export async function demanderMadd(
  profileId: string,
  p: { s: number; a: number },
  c: Cible,
  n: number,
  audio: Blob,
): Promise<{ ok: true; indication: Indication } | { ok: false; code: string }> {
  try {
    const q = new URLSearchParams({
      s: String(p.s),
      a: String(p.a),
      k: String(c.k),
      type: c.type,
      n: String(n),
    });
    const r = await fetch(`/api/v1/profiles/${profileId}/tajwid/madd?${q}`, {
      method: 'POST',
      headers: { 'x-awform': '1', 'content-type': (audio.type || 'audio/webm').split(';')[0]! },
      body: audio,
      credentials: 'same-origin',
    });
    const j = (await r.json().catch(() => null)) as {
      indication?: unknown;
      error?: { code?: string };
    } | null;
    if (!r.ok || !j) return { ok: false, code: j?.error?.code ?? 'reseau' };
    // seule valeur affichable : « trop_court » ; tout le reste = aucune indication
    return { ok: true, indication: j.indication === 'trop_court' ? 'trop_court' : null };
  } catch {
    return { ok: false, code: 'reseau' };
  }
}
