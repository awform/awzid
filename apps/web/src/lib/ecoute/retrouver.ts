/**
 * « RETROUVE CE VERSET » (interrupteur `shazam_coran`) : logique de l'appareil, chargée avec l'écran dédié
 * (`/coran/retrouver`, page rare : jamais préchargée). L'élève récite 5 à 15 s ; l'enregistrement part au serveur
 * (qui ne le garde pas) et reste en mémoire sur l'appareil le temps de l'envoi seulement.
 */
import { loadTexts } from '$lib/i18n';

/** l'enregistrement s'arrête tout seul à 15 s */
export const RETROUVER_MAX_S = 15;
/** en dessous de 3 s, on ne cherche pas : « récite un peu plus longtemps » */
export const RETROUVER_MIN_S = 3;
/** récitateur des versets retrouvés (conseillé aux débutants) */
export const RECITATEUR_RETROUVER = 'ayyoub-hafs';

export interface PassageTrouve {
  verset: string;
  passage: string[];
  score: number;
}
export interface Retrouve {
  statut: 'trouve' | 'pas_trouve' | 'trop_court';
  resultats: PassageTrouve[];
  egaux: string[];
}

export async function retrouver(
  profileId: string,
  audio: Blob,
): Promise<{ ok: true; r: Retrouve } | { ok: false; code: string }> {
  try {
    const r = await fetch(`/api/v1/profiles/${profileId}/ecoute/retrouver`, {
      method: 'POST',
      headers: { 'x-awform': '1', 'content-type': (audio.type || 'audio/webm').split(';')[0]! },
      body: audio,
      credentials: 'same-origin',
    });
    const j = (await r.json().catch(() => null)) as
      (Retrouve & { error?: { code?: string } }) | null;
    if (!r.ok || !j) {
      if (j?.error?.code) await loadTexts('erreurs');
      return { ok: false, code: j?.error?.code ?? 'reseau' };
    }
    return { ok: true, r: j };
  } catch {
    return { ok: false, code: 'reseau' };
  }
}

/** « 41:3 » -> [41, 3] */
export const sa = (v: string): [number, number] => v.split(':').map(Number) as [number, number];

export interface Carte {
  /** sourate et premier verset du passage (le lecteur s'ouvre là) */
  s: number;
  a: number;
  /** dernier verset du passage */
  a1: number;
  /** verset dont on montre le texte (le plus présent) */
  principal: number;
}

/**
 * Ce que montre l'écran : le passage retrouvé, ou TOUS les passages au même texte (ex æquo) ; puis les autres
 * passages possibles au-dessus du seuil (sans doublon).
 */
export function cartes(r: Retrouve): { principales: Carte[]; autres: Carte[] } {
  const carte = (p: PassageTrouve): Carte => {
    const [s, principal] = sa(p.verset);
    const as = p.passage
      .map(sa)
      .filter(([x]) => x === s)
      .map(([, a]) => a);
    return { s, a: Math.min(...as, principal), a1: Math.max(...as, principal), principal };
  };
  if (r.statut !== 'trouve' || !r.resultats.length) return { principales: [], autres: [] };
  const principales: Carte[] =
    r.egaux.length > 1
      ? r.egaux.map((v) => {
          const p = r.resultats.find((x) => x.verset === v);
          if (p) return carte(p);
          const [s, a] = sa(v);
          return { s, a, a1: a, principal: a };
        })
      : [carte(r.resultats[0]!)];
  const vus = new Set(principales.map((c) => `${c.s}:${c.principal}`));
  const autres: Carte[] = [];
  for (const p of r.resultats) {
    const c = carte(p);
    const k = `${c.s}:${c.principal}`;
    if (vus.has(k)) continue;
    vus.add(k);
    autres.push(c);
  }
  return { principales, autres };
}

/** paramètres du lecteur : le passage s'ouvre et se lit, récité par Muḥammad Ayyūb */
export const requeteLecteur = (c: Carte) => `?s=${c.s}&a=${c.a}&r=${RECITATEUR_RETROUVER}&lire=1`;
