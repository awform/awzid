/**
 * Suivi de la récitation « en direct » (interrupteur `shazam_coran`) : logique PURE, partagée par l'appareil et par le banc
 * de mesure (`services/ecoute-ia/eval/banc.mjs`). Aucun modèle, aucun réseau : des mots entendus (avec confiance et
 * instants) entrent, l'état du texte (mots reconnus, écarts à signaler) sort. Les règles du chantier A5 restent les mêmes :
 * ne repérer que des MOTS, se taire dans le doute, jamais de tajwīd, jamais de note.
 */
import {
  cleMot,
  comparer,
  ecartsDAccord,
  ressemblance,
  type Ecart,
  type EtatMot,
  type MotAttendu,
  type MotEntendu,
  type ResultatEcoute,
} from './ecoute.js';

export interface EntreeSuivi {
  /** mots validés (RNN-T) et leur seconde lecture (tête CTC) : seuls ils peuvent faire signaler un écart */
  stables: readonly MotEntendu[];
  stablesCtc: readonly MotEntendu[];
  /** mots du passage en cours (lus, pas encore validés) et mots partiels : ils dévoilent le texte, ne signalent rien */
  provisoires: readonly MotEntendu[];
  partiel: readonly MotEntendu[];
  voix: ReadonlyArray<readonly [number, number]>;
}

export interface EtatSuivi {
  resultat: ResultatEcoute;
  /** mot attendu « en cours » (le suivant du dernier reconnu) */
  courant: number;
}

/**
 * État du texte pendant le suivi : écarts des mots STABLES vus par les deux lectures (sinon rien n'est signalé) ; mots
 * reconnus (stables, provisoires ou partiels) dévoilés ; mot en cours après le dernier reconnu.
 */
export const REGLAGES_ETAT = {
  /**
   * Comment les deux lectures décident d'un écart : `accord` = les deux (RNN-T et tête CTC) le voient ; `rnnt` = la lecture
   * RNN-T suffit ; `veto` = la lecture RNN-T le voit et la tête CTC ne CONTREDIT pas (elle ne lit pas « ok » la moitié au moins des
   * mots visés) ; un mot AJOUTÉ exige toujours l'accord des deux (c'est l'écart le plus exposé aux mots mal lus).
   */
  mode: 'veto' as 'accord' | 'rnnt' | 'veto',
};

export function etatSuivi(att: readonly MotAttendu[], e: EntreeSuivi): EtatSuivi {
  const opts = { voix: e.voix, enCours: true };
  const r = comparer(att, e.stables, opts);
  let ecarts: Ecart[];
  if (REGLAGES_ETAT.mode === 'rnnt') ecarts = r.statut === 'resultat' ? r.ecarts : [];
  else {
    const c = comparer(att, e.stablesCtc, opts);
    if (r.statut !== 'resultat' || c.statut !== 'resultat') ecarts = [];
    else if (REGLAGES_ETAT.mode === 'accord') ecarts = ecartsDAccord(r.ecarts, c.ecarts);
    else {
      const accord = ecartsDAccord(r.ecarts, c.ecarts);
      ecarts = r.ecarts.filter((x) => {
        if (accord.includes(x)) return true;
        if (x.type === 'ajoute') return false;
        let ok = 0;
        for (let i = x.i; i <= x.fin; i++) if (c.mots[i] === 'ok') ok++;
        return ok * 2 < x.fin - x.i + 1;
      });
    }
  }
  const signale = new Set<number>();
  for (const x of ecarts)
    if (x.type !== 'ajoute') for (let i = x.i; i <= x.fin; i++) signale.add(i);
  const tous = comparer(att, [...e.stables, ...e.provisoires, ...e.partiel], { enCours: true });
  const mots: EtatMot[] = r.mots.map((m, i) =>
    signale.has(i) ? m : m === 'ok' || tous.mots[i] === 'ok' ? 'ok' : 'non_recite',
  );
  const fin = Math.max(r.finRecitee, tous.finRecitee);
  return { resultat: { ...r, mots, ecarts }, courant: fin + 1 };
}

// ------------------------------------------------------------------ fenêtre glissante

/** Une lecture du service en mode « fenêtre » : le dernier morceau de la récitation relu en entier. */
export interface LectureFenetre {
  /** instant (secondes de la séance) où finit la fenêtre lue */
  t: number;
  mots: readonly MotEntendu[];
  motsCtc: readonly MotEntendu[];
  voix: ReadonlyArray<readonly [number, number]>;
}

export interface ReglagesFenetre {
  /** secondes avant la fin de la fenêtre où les mots ne sont pas encore validés (la fin d'un mot lu sans sa suite est peu sûre) */
  margeDroite: number;
  /** au-delà de cet âge (secondes avant la fin de la fenêtre), un mot est validé même sans accord entre deux lectures */
  forcer: number;
  /** écart d'instant toléré entre deux lectures pour dire que c'est le même mot (secondes) */
  tolerance: number;
}

export const REGLAGES_FENETRE: ReglagesFenetre = { margeDroite: 1.0, forcer: 3.5, tolerance: 0.6 };

const milieu = (w: MotEntendu) => ((w.t0 ?? 0) + (w.t1 ?? w.t0 ?? 0)) / 2;

/**
 * Validation des mots par ACCORD ENTRE LECTURES SUCCESSIVES (comme un « local agreement ») : à chaque lecture de la
 * fenêtre, un mot n'est validé que s'il est (1) loin du bord droit de la fenêtre (sa suite a été entendue) et (2) lu
 * pareil, au même endroit, par la lecture précédente — sinon il reste provisoire (il dévoile le texte, il ne signale
 * rien). Un mot reste « en attente » d'accord au plus `forcer` secondes. Les mots validés forment la transcription
 * `stables` (RNN-T) / `stablesCtc` que `etatSuivi` compare au texte.
 */
export class FenetreSuivi {
  stables: MotEntendu[] = [];
  stablesCtc: MotEntendu[] = [];
  voix: Array<[number, number]> = [];
  provisoires: MotEntendu[] = [];
  provisoiresCtc: MotEntendu[] = [];
  /** instant jusqu'où la transcription est validée */
  horizon = 0;
  /** nombre de lectures reçues */
  lectures = 0;
  private prec: MotEntendu[] = [];

  constructor(private reglages: ReglagesFenetre = REGLAGES_FENETRE) {}

  ajouter(l: LectureFenetre): void {
    this.lectures++;
    const { margeDroite, forcer, tolerance } = this.reglages;
    const cur = l.mots.filter((w) => milieu(w) >= this.horizon);
    let n = 0;
    for (; n < cur.length; n++) {
      const w = cur[n]!;
      const m = milieu(w);
      if (m >= l.t - margeDroite) break;
      if (m >= l.t - forcer) {
        const p = this.prec[n];
        if (
          !p ||
          ressemblance(cleMot(p.w), cleMot(w.w)) < 0.85 ||
          Math.abs(milieu(p) - m) > tolerance
        )
          break;
      }
    }
    if (n > 0) {
      const h = cur[n - 1]!.t1 ?? milieu(cur[n - 1]!);
      this.stables.push(...cur.slice(0, n));
      this.stablesCtc.push(...l.motsCtc.filter((w) => milieu(w) >= this.horizon && milieu(w) < h));
      for (const [a, b] of l.voix) {
        const x = Math.max(a, this.horizon);
        const y = Math.min(b, h);
        if (y > x) this.voix.push([x, y]);
      }
      this.horizon = h;
    }
    this.prec = cur.slice(n);
    this.provisoires = this.prec;
    this.provisoiresCtc = l.motsCtc.filter((w) => milieu(w) >= this.horizon);
  }

  entree(): EntreeSuivi {
    return {
      stables: this.stables,
      stablesCtc: this.stablesCtc,
      provisoires: this.provisoires,
      partiel: [],
      voix: this.voix,
    };
  }
}
