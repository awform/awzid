/**
 * Numéros de téléphone (inscription par numéro WhatsApp, décision du client du 18/10/2026) — UNE seule source,
 * partagée par l'API (contrôle) et l'application (saisie), sans dépendance.
 *
 * Règles simples et documentées (pas de bibliothèque : libphonenumber pèse ~150 Ko, trop pour la page d'inscription) :
 *  - forme finale E.164 : « + », indicatif du pays, numéro national sans le 0 de tête ; 8 à 15 chiffres en tout ;
 *  - saisie acceptée : espaces, points, tirets, parenthèses ; « 00 » au début vaut « + » ;
 *  - sans « + », le numéro est lu dans le pays choisi (indicatif proposé : +221 pour le Sénégal) ;
 *  - pays de la table ci-dessous : longueur nationale exacte et, quand elle est connue, forme d'un numéro MOBILE
 *    (WhatsApp vit sur un mobile ; au Sénégal : 70, 71, 75, 76, 77, 78) ; autre indicatif : règle générale E.164 ;
 *  - la table est une donnée (ajouter un pays = une ligne), relue le 18/10/2026 sur les plans de numérotation publiés
 *    (UIT-T E.164, régulateurs nationaux).
 */

export interface PlanPays {
  /** indicatif sans « + » */
  ind: string;
  /** longueurs possibles du numéro national (sans le 0 de tête) */
  long: readonly number[];
  /** forme d'un numéro mobile (sur le numéro national), si connue */
  mobile?: RegExp;
  /** le 0 de tête de la forme nationale tombe dans la forme internationale (France : 06… → +33 6…) */
  zero?: boolean;
}

/** Pays de la table (le Sénégal d'abord : école pilote, familles sans e-mail). */
export const PLANS: Readonly<Record<string, PlanPays>> = {
  SN: { ind: '221', long: [9], mobile: /^7[015-8]/ },
  FR: { ind: '33', long: [9], mobile: /^[67]/, zero: true },
  BE: { ind: '32', long: [9], mobile: /^4[5-9]/, zero: true },
  CH: { ind: '41', long: [9], mobile: /^7[4-9]/, zero: true },
  LU: { ind: '352', long: [9], mobile: /^6/ },
  DE: { ind: '49', long: [10, 11], mobile: /^1[5-7]/, zero: true },
  ES: { ind: '34', long: [9], mobile: /^[67]/ },
  IT: { ind: '39', long: [9, 10], mobile: /^3/ },
  PT: { ind: '351', long: [9], mobile: /^9/ },
  NL: { ind: '31', long: [9], mobile: /^6/, zero: true },
  GB: { ind: '44', long: [10], mobile: /^7/, zero: true },
  IE: { ind: '353', long: [9], mobile: /^8/, zero: true },
  US: { ind: '1', long: [10] },
  CA: { ind: '1', long: [10] },
  MA: { ind: '212', long: [9], mobile: /^[67]/, zero: true },
  DZ: { ind: '213', long: [9], mobile: /^[567]/, zero: true },
  TN: { ind: '216', long: [8], mobile: /^[2459]/ },
  MR: { ind: '222', long: [8], mobile: /^[234]/ },
  ML: { ind: '223', long: [8], mobile: /^[5-9]/ },
  GN: { ind: '224', long: [9], mobile: /^6/ },
  CI: { ind: '225', long: [10], mobile: /^0[157]/ },
  BF: { ind: '226', long: [8], mobile: /^[5-7]/ },
  NE: { ind: '227', long: [8], mobile: /^[89]/ },
  TG: { ind: '228', long: [8], mobile: /^[79]/ },
  BJ: { ind: '229', long: [10], mobile: /^01/ },
  GM: { ind: '220', long: [7], mobile: /^[2-79]/ },
  GW: { ind: '245', long: [9], mobile: /^9/ },
  CV: { ind: '238', long: [7], mobile: /^9/ },
  NG: { ind: '234', long: [10], mobile: /^[789]/, zero: true },
  GH: { ind: '233', long: [9], mobile: /^[25]/, zero: true },
  CM: { ind: '237', long: [9], mobile: /^6/ },
  GA: { ind: '241', long: [8], mobile: /^[67]/ },
  CG: { ind: '242', long: [9], mobile: /^0[456]/ },
  CD: { ind: '243', long: [9], mobile: /^[89]/, zero: true },
  EG: { ind: '20', long: [10], mobile: /^1/, zero: true },
  SA: { ind: '966', long: [9], mobile: /^5/, zero: true },
  AE: { ind: '971', long: [9], mobile: /^5/, zero: true },
  QA: { ind: '974', long: [8], mobile: /^[3567]/ },
  KW: { ind: '965', long: [8], mobile: /^[569]/ },
  TR: { ind: '90', long: [10], mobile: /^5/, zero: true },
};

/** Indicatif proposé pour un pays (null : pays hors table, saisie avec « + »). */
export function indicatifDe(pays: string | null | undefined): string | null {
  return (pays && PLANS[pays.toUpperCase()]?.ind) || null;
}

export type ProblemeTelephone = 'vide' | 'format' | 'longueur' | 'mobile' | 'indicatif';
export type ResultatTelephone =
  { ok: true; e164: string; pays: string | null } | { ok: false; raison: ProblemeTelephone };

/** Format E.164 final (contrôle du serveur). */
export const E164 = /^\+[1-9]\d{7,14}$/;

/** Pays de la table dont l'indicatif commence le numéro international (le plus long d'abord). */
function paysDuNumero(chiffres: string): Array<[string, PlanPays]> {
  return Object.entries(PLANS)
    .filter(([, p]) => chiffres.startsWith(p.ind))
    .sort((a, b) => b[1].ind.length - a[1].ind.length);
}

function controle(plan: PlanPays, national: string): ProblemeTelephone | null {
  if (!plan.long.includes(national.length)) return 'longueur';
  if (plan.mobile && !plan.mobile.test(national)) return 'mobile';
  return null;
}

/**
 * Lit un numéro saisi et rend sa forme E.164, ou la raison du refus. `paysParDefaut` sert aux numéros écrits
 * sans « + » (forme nationale).
 */
export function normaliserTelephone(
  saisie: string,
  paysParDefaut?: string | null,
): ResultatTelephone {
  let s = (saisie ?? '').trim().replace(/[\s.\-()‎‏]/g, '');
  if (!s) return { ok: false, raison: 'vide' };
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (s.startsWith('+')) {
    const chiffres = s.slice(1);
    if (!/^[1-9]\d*$/.test(chiffres)) return { ok: false, raison: 'format' };
    const candidats = paysDuNumero(chiffres);
    if (candidats.length) {
      // même indicatif pour plusieurs pays (+1 : États-Unis, Canada) : même règle, le premier suffit ; le pays
      // par défaut l'emporte s'il en fait partie
      const [code, plan] =
        candidats.find(([c, p]) => c === paysParDefaut && p.ind === candidats[0]![1].ind) ??
        candidats[0]!;
      let national = chiffres.slice(plan.ind.length);
      // « +33 06… » : le 0 national recopié par erreur est retiré
      if (plan.zero && national.startsWith('0')) national = national.slice(1);
      const pb = controle(plan, national);
      if (pb) return { ok: false, raison: pb };
      return { ok: true, e164: `+${plan.ind}${national}`, pays: code };
    }
    if (chiffres.length < 8 || chiffres.length > 15) return { ok: false, raison: 'longueur' };
    return { ok: true, e164: `+${chiffres}`, pays: null };
  }
  if (!/^\d+$/.test(s)) return { ok: false, raison: 'format' };
  const plan = paysParDefaut ? PLANS[paysParDefaut.toUpperCase()] : undefined;
  if (!plan) return { ok: false, raison: 'indicatif' };
  let national = s;
  if (plan.zero && national.startsWith('0')) national = national.slice(1);
  // numéro national précédé de l'indicatif sans « + » (221 77 123 45 67)
  if (!plan.long.includes(national.length) && national.startsWith(plan.ind)) {
    const reste = national.slice(plan.ind.length);
    if (plan.long.includes(reste.length)) national = reste;
  }
  const pb = controle(plan, national);
  if (pb) return { ok: false, raison: pb };
  return { ok: true, e164: `+${plan.ind}${national}`, pays: paysParDefaut!.toUpperCase() };
}

/**
 * Forme MASQUÉE (administration, compte) : indicatif et deux derniers chiffres seulement — « +221 ••••••• 67 » ;
 * `garder` = 4 pour la validation manuelle (l'administrateur reconnaît le numéro du message reçu).
 */
export function masquerTelephone(e164: string | null | undefined, garder = 2): string | null {
  if (!e164 || !E164.test(e164)) return null;
  const chiffres = e164.slice(1);
  const plan = paysDuNumero(chiffres)[0]?.[1];
  const ind = plan?.ind ?? chiffres.slice(0, Math.min(3, chiffres.length - 6));
  const reste = chiffres.slice(ind.length);
  const g = Math.min(garder, reste.length - 1);
  return `+${ind} ${'•'.repeat(Math.max(1, reste.length - g))} ${reste.slice(-g)}`;
}

/** Lien « cliquer pour discuter » de WhatsApp (gratuit, sans compte) : ouvre la conversation, message pré-rempli. */
export function lienWhatsapp(numero: string, texte: string): string {
  return `https://wa.me/${numero.replace(/\D/g, '')}?text=${encodeURIComponent(texte)}`;
}

/**
 * Codes de vérification « inversée » : la personne ENVOIE ce code depuis son WhatsApp ; alphabet sans caractères
 * ambigus (pas de 0 O 1 I L U), 6 signes. Le message contient « AWZID » suivi du code.
 */
export const ALPHABET_DEFI = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_DEFI = /AWZID[\s:-]*([2-9A-HJKMNP-TV-Z]{6})(?![A-Z0-9])/i;
export function lireCodeDefi(texte: string): string | null {
  const m = CODE_DEFI.exec(texte ?? '');
  return m ? m[1]!.toUpperCase() : null;
}

/**
 * Codes de RÉCUPÉRATION (à recopier sur papier) : 10 signes de l'alphabet ci-dessus, affichés en deux groupes
 * (« 4F7K2-Q9XRT ») ; saisie tolérante (minuscules, espaces, tiret).
 */
export function normaliserCodeSecours(saisie: string): string | null {
  const s = (saisie ?? '').toUpperCase().replace(/[\s-]/g, '');
  return /^[2-9A-HJKMNP-TV-Z]{10}$/.test(s) ? s : null;
}
export function formaterCodeSecours(norm: string): string {
  return `${norm.slice(0, 5)}-${norm.slice(5)}`;
}

/** L'identifiant saisi à la connexion est-il un numéro (et non une adresse e-mail) ? */
export function ressembleTelephone(saisie: string): boolean {
  const s = (saisie ?? '').trim();
  return !s.includes('@') && /^[+0-9][0-9\s.\-()]{5,}$/.test(s);
}
