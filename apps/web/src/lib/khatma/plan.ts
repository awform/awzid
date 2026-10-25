/**
 * Khatma et wird (26/10/2026) — calculs PURS de la part du jour (testés dans khatma.test.ts), sans réseau ni texte.
 *
 * Principe « sans culpabiliser » : la part du jour est RECALCULÉE chaque jour à partir de ce qui reste à lire et du temps
 * qui reste. Prendre de l'avance l'allège, prendre du retard l'étale ; une date de fin dépassée ne devient jamais une dette :
 * on propose simplement de la repousser. Aucun compteur de retard, aucune série, aucun classement.
 * Le texte coranique n'est pas manipulé ici : seulement des numéros de pages du Muṣḥaf de Médine (604).
 */

export const TOTAL_PAGES = 604;

export interface PlanVue {
  kind: 'khatma' | 'wird';
  scope: 'profil' | 'famille' | 'classe';
  mode: 'duree' | 'pages' | 'wird';
  startDate: string;
  endDate: string | null;
  pagesPerDay: number | null;
  status: 'active' | 'terminee' | 'archivee';
}
export interface PartVue {
  firstPage: number;
  lastPage: number;
  done: number;
  doneDayStart: number;
  dayMark: string | null;
}

const num = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
export const joursEntre = (a: string, b: string) => num(b) - num(a);
export const ajouterJours = (d: string, n: number) =>
  new Date((num(d) + n) * 86_400_000).toISOString().slice(0, 10);

export type Rythme = 'avance' | 'rythme' | 'souple';

export interface Calcul {
  /** pages de la part */
  taille: number;
  /** pages lues dans la part (un wird cumule les tours) */
  fait: number;
  /** pages restantes de la part (khatma) ; null pour un wird */
  reste: number | null;
  /** pages lues au début d'aujourd'hui (fixe pendant la journée : la part du jour ne rétrécit pas en lisant) */
  debutJour: number;
  luAujourdhui: number;
  /** pages prévues aujourd'hui (au moins 1 tant qu'il reste à lire) */
  partDuJour: number;
  /** première et dernière page de la part du jour (numéros du Muṣḥaf) ; null si tout est lu */
  pagesDuJour: [number, number] | null;
  jourLu: boolean;
  /** première page pas encore lue (reprise) ; null si la part est terminée */
  pageCourante: number | null;
  tours: number;
  termine: boolean;
  /** jours restants, aujourd'hui compris (khatma sur une durée) */
  joursRestants: number | null;
  /** fin prévue : la date choisie (durée) ou celle que donne le rythme (pages par jour) ; null pour un wird */
  finPrevue: string | null;
  /** la date choisie est passée : on PROPOSE de la repousser (jamais une dette) */
  finDepassee: boolean;
  finProposee: string | null;
  rythme: Rythme;
}

/** Pages de la part du jour et reste du calcul pour un plan, une part et un jour LOCAL (AAAA-MM-JJ). */
export function calculer(plan: PlanVue, part: PartVue, aujourdhui: string): Calcul {
  const taille = part.lastPage - part.firstPage + 1;
  const wird = plan.kind === 'wird';
  const fait = wird ? part.done : Math.min(part.done, taille);
  const debutJour = part.dayMark === aujourdhui ? Math.min(part.doneDayStart, fait) : fait;
  const luAujourdhui = Math.max(0, fait - debutJour);
  const termine = !wird && fait >= taille;
  const tours = wird ? Math.floor(fait / taille) : termine ? 1 : 0;
  const resteDebut = wird ? taille : Math.max(0, taille - debutJour);
  const reste = wird ? null : Math.max(0, taille - fait);

  let partDuJour: number;
  let joursRestants: number | null = null;
  let finPrevue: string | null = null;
  let finDepassee = false;
  let finProposee: string | null = null;
  let rythme: Rythme = 'rythme';

  if (wird) {
    partDuJour = Math.max(1, plan.pagesPerDay ?? 1);
  } else if (plan.mode === 'pages') {
    const ppd = Math.max(1, plan.pagesPerDay ?? 1);
    partDuJour = termine ? 0 : Math.min(ppd, resteDebut || ppd);
    finPrevue = termine
      ? null
      : ajouterJours(aujourdhui, Math.ceil(Math.max(resteDebut, 1) / ppd) - 1);
  } else {
    const fin = plan.endDate ?? aujourdhui;
    const duree = Math.max(1, joursEntre(plan.startDate, fin) + 1);
    const nominal = Math.max(1, Math.ceil(taille / duree));
    joursRestants = joursEntre(aujourdhui, fin) + 1;
    finPrevue = fin;
    if (termine) partDuJour = 0;
    else if (joursRestants >= 1) {
      partDuJour = Math.max(1, Math.ceil(resteDebut / joursRestants));
    } else {
      // date passée : on garde le rythme d'origine et on propose une nouvelle date, sans reproche
      finDepassee = true;
      joursRestants = 0;
      partDuJour = Math.min(nominal, resteDebut);
      finProposee = ajouterJours(aujourdhui, Math.ceil(resteDebut / nominal) - 1);
    }
    // avance ou rythme : comparaison avec la ligne droite d'origine, au début d'aujourd'hui
    const ecoules = Math.max(0, Math.min(duree, joursEntre(plan.startDate, aujourdhui)));
    const attendu = Math.ceil((taille * ecoules) / duree);
    rythme =
      debutJour >= attendu + nominal
        ? 'avance'
        : debutJour >= attendu - nominal
          ? 'rythme'
          : 'souple';
  }

  const jourLu = termine || (partDuJour > 0 && luAujourdhui >= partDuJour);
  const prochaine = wird
    ? part.firstPage + (fait % taille)
    : termine
      ? null
      : part.firstPage + fait;
  // pages du jour : de la première page non lue AU DÉBUT du jour, sur `partDuJour` pages (sans sortir de la part)
  const debutPage = wird ? part.firstPage + (debutJour % taille) : part.firstPage + debutJour;
  const pagesDuJour: [number, number] | null =
    termine || partDuJour <= 0
      ? null
      : [debutPage, Math.min(part.lastPage, debutPage + partDuJour - 1)];
  return {
    taille,
    fait,
    reste,
    debutJour,
    luAujourdhui,
    partDuJour,
    pagesDuJour,
    jourLu,
    pageCourante: prochaine,
    tours,
    termine,
    joursRestants,
    finPrevue,
    finDepassee,
    finProposee,
    rythme,
  };
}

/** Avancement à enregistrer quand on a lu sa part du jour (jamais en arrière, jamais au-delà de la part d'une khatma). */
export function apresPartDuJour(plan: PlanVue, part: PartVue, c: Calcul): number {
  const cible = c.debutJour + c.partDuJour;
  const max = plan.kind === 'wird' ? Number.MAX_SAFE_INTEGER : c.taille;
  return Math.min(max, Math.max(c.fait, cible));
}

/** Avancement quand on dit « j'en suis à la page N » (N = première page pas encore lue ou page en cours). */
export function avancementDepuisPage(
  plan: PlanVue,
  part: PartVue,
  page: number,
  c: Calcul,
): number {
  if (plan.kind === 'wird') {
    const tour = Math.floor(c.fait / c.taille);
    return tour * c.taille + Math.max(0, Math.min(c.taille, page - part.firstPage));
  }
  return Math.max(0, Math.min(c.taille, page - part.firstPage));
}

/** Juzʾ d'une page du Muṣḥaf de Médine (le premier : pages 1 à 21 ; ensuite 20 pages chacun). */
export function juzDePage(page: number): number {
  return page <= 21 ? 1 : Math.min(30, 2 + Math.floor((page - 22) / 20));
}

/** Une part faite de juzʾ entiers ? Alors « juzʾ 3 » ou « juzʾ 3 à 5 », sinon null (on dit alors les pages). */
export function juzDePart(first: number, last: number): [number, number] | null {
  const debutJuz = (j: number) => (j <= 1 ? 1 : 2 + 20 * (j - 1));
  const a = juzDePage(first);
  const b = juzDePage(last);
  if (debutJuz(a) !== first) return null;
  const finDe = b >= 30 ? TOTAL_PAGES : debutJuz(b + 1) - 1;
  return finDe === last ? [a, b] : null;
}

/** Durées proposées pour une khatma (en jours) et pages par jour proposées. */
export const DUREES = [30, 60, 90, 180, 365] as const;
export const PAGES_PAR_JOUR = [1, 2, 4, 5, 10, 20] as const;
export const WIRD_PAGES = [1, 2, 5, 10, 20] as const;

/** Pages par jour qu'implique une durée (arrondi au-dessus) : « 604 pages en 30 jours : 21 pages par jour ». */
export const pagesPourDuree = (jours: number) => Math.ceil(TOTAL_PAGES / Math.max(1, jours));
/** Jours qu'implique un rythme (arrondi au-dessus). */
export const joursPourRythme = (pagesParJour: number) =>
  Math.ceil(TOTAL_PAGES / Math.max(1, pagesParJour));

/** Heures de rappel proposées (hors heures calmes par défaut : 20 h → 8 h). */
export const HEURES_RAPPEL = [9, 12, 14, 17, 19] as const;
