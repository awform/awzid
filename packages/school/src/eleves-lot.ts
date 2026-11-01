/**
 * V2-5 : élèves créés en liste par l'enseignant — fonctions PURES, partagées par le serveur et l'application
 * (sans dépendance, utilisables dans le navigateur) :
 *  - lecture d'une liste saisie ou collée depuis un tableur (prénom + année de naissance, une ligne par élève) ;
 *  - mot de passe généré de 8 caractères (alphabet sans signes ambigus) ;
 *  - message WhatsApp aux parents : l'IDENTIFIANT seulement, JAMAIS le mot de passe.
 * Aucun contenu religieux.
 */

/** nombre d'élèves créés d'un coup au plus */
export const LOT_MAX = 60;
/** élèves avec identifiant dans une même classe au plus */
export const CLASSE_MAX = 300;

export interface LigneEleve {
  prenom: string;
  annee: number;
}
export type CodeRejet =
  'prenom_manquant' | 'annee_manquante' | 'annee_invalide' | 'prenom_invalide';
export interface RejetLigne {
  /** numéro de la ligne dans le texte collé (à partir de 1) */
  ligne: number;
  texte: string;
  code: CodeRejet;
}

const ANNEE_MIN = 1990;
const ENTETE = /pr[eé]nom|nom|name|ann[eé]e|year|naissance|born/i;
// signes de commande et d'orientation : jamais dans un prénom
// eslint-disable-next-line no-control-regex
const INTERDITS = /[\u0000-\u001f\u007f<>{}\\‎‏‪-‮]/;

/** « Moussa », « Awa », « Jean-Éric » : lettres de toute langue, espaces, apostrophes, tirets, points */
export function prenomValide(p: string): boolean {
  const s = p.trim();
  if (s.length < 1 || s.length > 40) return false;
  if (INTERDITS.test(s)) return false;
  return /\p{L}/u.test(s) && /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u.test(s);
}

/**
 * Lit un texte collé d'un tableur (colonnes séparées par une tabulation, « ; » ou « , ») ou saisi à la main
 * (« Moussa 2017 »). L'année est le nombre de 4 chiffres de la ligne (une date « 12/03/2017 » donne 2017).
 * Une première ligne d'en-tête (« Prénom  Année ») est ignorée. Les lignes vides aussi.
 */
export function lireListeEleves(
  texte: string,
  anneeCourante = new Date().getUTCFullYear(),
): { eleves: LigneEleve[]; rejets: RejetLigne[] } {
  const eleves: LigneEleve[] = [];
  const rejets: RejetLigne[] = [];
  const lignes = (texte ?? '').replace(/^﻿/, '').split(/\r\n|\r|\n/);
  let premiere = true;
  lignes.forEach((brute, i) => {
    const ligne = brute.trim();
    if (!ligne) return;
    const estPremiere = premiere;
    premiere = false;
    const annees = [...ligne.matchAll(/(?<!\d)(\d{4})(?!\d)/g)].map((m) => m[1]!);
    if (estPremiere && annees.length === 0 && ENTETE.test(ligne)) return;
    const rejet = (code: CodeRejet) => rejets.push({ ligne: i + 1, texte: ligne, code });
    if (annees.length === 0) return rejet('annee_manquante');
    // dernière année de la ligne (dans « 12/03/2017 » c'est la seule ; dans « Awa 2017 » aussi)
    const annee = Number(annees[annees.length - 1]);
    if (annee < ANNEE_MIN || annee > anneeCourante) return rejet('annee_invalide');
    // prénom : première cellule qui n'est pas un nombre ni une date
    const cellules = ligne.split(/[\t;,]/).map((c) => c.replace(/^["']+|["']+$/g, '').trim());
    let prenom = '';
    if (cellules.length > 1) {
      prenom = cellules.find((c) => c && !/^[\d\s/.-]+$/.test(c)) ?? '';
    } else {
      prenom = ligne.replace(/[\s/.-]*\d{4}[\s/.-]*$/, '').replace(/^["']+|["']+$/g, '');
      if (!prenom || prenom === ligne) prenom = ligne.replace(/\d+/g, ' ').trim();
    }
    prenom = prenom.replace(/\s+/g, ' ').trim();
    if (!prenom) return rejet('prenom_manquant');
    if (!prenomValide(prenom)) return rejet('prenom_invalide');
    eleves.push({ prenom, annee });
  });
  return { eleves, rejets };
}

/** sans 0 O 1 l I (illisibles sur une étiquette imprimée) ; minuscules et chiffres seulement */
export const ALPHABET_MDP_ELEVE = 'abcdefghjkmnpqrstuvwxyz23456789';
export const LONGUEUR_MDP_ELEVE = 8;

/** `tirer(n)` renvoie un entier de 0 à n-1 (le serveur passe `crypto.randomInt`) */
export function genererMotDePasseEleve(tirer: (n: number) => number): string {
  let s = '';
  for (let i = 0; i < LONGUEUR_MDP_ELEVE; i++)
    s += ALPHABET_MDP_ELEVE[tirer(ALPHABET_MDP_ELEVE.length)];
  return s;
}

// ------------------------------------------------------------------ message aux parents

export type LangueMessage = 'fr' | 'en' | 'ar' | 'es' | 'de';
export const LANGUES_MESSAGE: readonly LangueMessage[] = ['fr', 'en', 'ar', 'es', 'de'];

/** Le mot de passe n'y figure jamais : il reste sur la fiche remise à l'élève. */
const MESSAGES: Record<LangueMessage, string> = {
  fr: 'Bonjour, {ecole} a créé le compte de {prenom} pour apprendre sur Awzid. Identifiant : {login}. Le mot de passe est sur la fiche remise à {prenom} par l’enseignant ; il n’est jamais envoyé par message.',
  en: 'Hello, {ecole} has created {prenom}’s account to learn on Awzid. Username: {login}. The password is on the sheet the teacher gave to {prenom}; it is never sent by message.',
  ar: 'السلام عليكم، أنشأت {ecole} حساب {prenom} للتعلّم على أوزيد. اسم المستخدم: {login}. كلمة المرور على الورقة التي سلّمها المعلّم إلى {prenom}، ولا تُرسل أبدًا في رسالة.',
  es: 'Hola, {ecole} ha creado la cuenta de {prenom} para aprender en Awzid. Identificador: {login}. La contraseña está en la hoja que el profesor entregó a {prenom}; nunca se envía por mensaje.',
  de: 'Guten Tag, {ecole} hat das Konto von {prenom} zum Lernen bei Awzid angelegt. Benutzername: {login}. Das Passwort steht auf dem Blatt, das die Lehrkraft {prenom} gegeben hat; es wird nie per Nachricht gesendet.',
};

export function messageParents(
  langue: string,
  d: { prenom: string; login: string; ecole?: string | null },
): string {
  const modele =
    MESSAGES[
      (LANGUES_MESSAGE as readonly string[]).includes(langue) ? (langue as LangueMessage) : 'fr'
    ];
  const ecole = (d.ecole ?? '').trim() || (langue === 'fr' ? 'l’école' : 'the school');
  return modele
    .replaceAll('{ecole}', ecole)
    .replaceAll('{prenom}', d.prenom)
    .replaceAll('{login}', d.login);
}

/**
 * Lien WhatsApp « cliquer pour discuter » (gratuit, ouvert par le téléphone de l'enseignant) : sans numéro,
 * l'enseignant choisit le contact du parent dans WhatsApp. Seul l'identifiant figure dans le texte.
 */
export function lienWhatsappParents(
  langue: string,
  d: { prenom: string; login: string; ecole?: string | null },
): string {
  return `https://wa.me/?text=${encodeURIComponent(messageParents(langue, d))}`;
}
