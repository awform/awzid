/**
 * Classifieur de périmètre LOCAL (déterministe) appliqué à la question AVANT tout appel au modèle
 * (ARCHITECTURE_V2 § 1.6 étape 5, § 1.7). L'architecture prévoit en plus un classifieur par modèle en V1 ;
 * celui-ci reste la première barrière, testée par la batterie adverse. Français, anglais, arabe.
 */

export type Category =
  | 'detresse'
  | 'rencontre'
  | 'injection'
  | 'avis_religieux'
  | 'polemique'
  | 'donnees_perso'
  | 'coran_texte'
  | 'hadith'
  | 'identite'
  | 'normal';

/** Minuscules, sans accents latins (table simple, sans normalisation Unicode). */
export function fold(s: string): string {
  const MAP: Record<string, string> = {
    à: 'a',
    â: 'a',
    ä: 'a',
    á: 'a',
    ā: 'a',
    ç: 'c',
    é: 'e',
    è: 'e',
    ê: 'e',
    ë: 'e',
    î: 'i',
    ï: 'i',
    ī: 'i',
    í: 'i',
    ô: 'o',
    ö: 'o',
    ó: 'o',
    û: 'u',
    ù: 'u',
    ü: 'u',
    ū: 'u',
    ú: 'u',
    ñ: 'n',
    ḥ: 'h',
    ṣ: 's',
    ḍ: 'd',
    ṭ: 't',
    ẓ: 'z',
    ʿ: "'",
    ʾ: "'",
    '’': "'",
    œ: 'oe',
    æ: 'ae',
  };
  let out = '';
  for (const ch of s.toLowerCase()) out += MAP[ch] ?? ch;
  return out.replace(/\s+/g, ' ');
}

const R = (parts: string[]) => new RegExp(parts.join('|'), 'i');

const DETRESSE = R([
  'me frapp',
  'me bat\\b',
  'me battent',
  '\\bbattu',
  'me cogn',
  'me tabass',
  'me pendre',
  'me jeter (du|par|sous)',
  'en finir',
  'plus vivre',
  'plus envie de vivre',
  'me tape',
  'me fait mal',
  'me fait du mal',
  'me font du mal',
  'me fais du mal',
  'hurts me',
  'hurt me',
  'suicid',
  'me tuer',
  'envie de mourir',
  'veux mourir',
  'mourir',
  'idees noires',
  'me faire du mal',
  'me scarifi',
  'abus',
  'viol(e|ee|er|ent|ence)?\\b',
  'attouchement',
  'me touche',
  'harcel',
  'peur de rentrer',
  'peur a la maison',
  'personne ne m.aime',
  'je suis tout seul',
  'je me sens seul',
  'fugue',
  'enferm',
  'maltrait',
  'hits me',
  'beats me',
  'kill myself',
  'want to die',
  'hurt myself',
  'abuse',
  'bully',
  'يضربني',
  'اريد ان اموت',
  'أريد أن أموت',
  'انتحار',
  'يؤذيني',
  'ضربني',
  'أريد الموت',
  'اريد الموت',
]);
const RENCONTRE = R([
  'me rencontrer',
  'te rencontrer',
  'nous rencontrer',
  'se rencontrer',
  'rencontrer (seul|quelqu|en vrai)',
  'se retrouver',
  'retrouve.moi',
  'ajoute.moi',
  'add me',
  'appelle.moi',
  'call me',
  'se voir',
  'on se voit',
  'viens chez',
  'ton numero',
  'ton adresse',
  'ton snap',
  'ton insta',
  'whatsapp',
  'instagram',
  'snapchat',
  'tiktok',
  'discord',
  'telegram',
  'donne.moi ton',
  'ou habites.tu',
  'ou tu habites',
  'tu habites ou',
  'tu vis ou',
  't.es ou',
  'meet me',
  'your number',
  'your address',
  'where do you live',
]);
const INJECTION = R([
  'ignore (tes|les|toutes|vos|ces)',
  'oublie (tes|les|toutes)',
  'ne tiens pas compte',
  'nouvelles? (regles|instructions|consignes)',
  'tu es (maintenant|desormais)',
  'a partir de maintenant tu',
  'fais semblant',
  'joue le role',
  'role.?play',
  'mode (developpeur|dev|admin|debug)',
  'system prompt',
  'invite systeme',
  'prompt systeme',
  'tes instructions',
  'jailbreak',
  '\\bdan\\b',
  'ignore (all|previous|your)',
  'you are now',
  'pretend',
  'developer mode',
  'reponds sans (filtre|regle)',
  'sans censure',
  'desactive (le|ton) filtre',
  '<\\/?system>',
  '\\[inst\\]',
  'base64',
  'repete apres moi',
  'repeat after me',
]);
const AVIS = R([
  'haram',
  'halal',
  'licite',
  'illicite',
  'interdit (en|par l.)islam',
  'permis (en|par l.)islam',
  'est.ce permis',
  'est.il permis',
  'ai.je le droit',
  'a.t.on le droit',
  'j.ai le droit',
  'est.ce que je peux',
  'puis.je',
  'est.ce que j.ai le droit',
  'fatwa',
  'peche',
  'makruh',
  'makrouh',
  'mustahab',
  'wajib',
  '\\bfard\\b',
  'obligatoire',
  'est.ce grave',
  'est.ce mal',
  'rompt (le|mon) jeune',
  'annule (la|ma) priere',
  'invalide',
  'zakat',
  '\\bdot\\b',
  'mahr',
  'divorce',
  'heritage',
  'mariage',
  'epouser',
  'avis religieux',
  'que dit l.islam',
  'selon l.islam',
  'mon pere dit',
  'ma mere dit',
  'l.imam dit',
  'quelle ecole',
  'quel madhhab',
  'madhab',
  'malikite',
  'hanafite',
  'chafiite',
  'shafiite',
  'hanbalite',
  'divergence',
  'qui a raison',
  'musique (est|serait|c.est)',
  'ecouter de la musique',
  '(droit|permis|interdit).{0,25}musique',
  'music is',
  'tatouage',
  'interet bancaire',
  'riba',
  'is it haram',
  'is it halal',
  'allowed in islam',
  'forbidden',
  'is it a sin',
  'حرام',
  'حلال',
  'فتوى',
  'يجوز',
  'هل يجوز',
]);
const POLEMIQUE = R([
  'politique',
  'politicien',
  'election',
  'president',
  'gouvernement',
  'guerre',
  'israel',
  'palestin',
  'gaza',
  'ukrain',
  'chiite',
  'sunnite',
  'salaf',
  'soufi',
  'wahhab',
  'confrerie',
  'mouride',
  'tidjan',
  'khalif',
  'ikhwan',
  'freres musulmans',
  'chretien',
  'juif',
  'juda',
  'christian',
  '\\bjews?\\b',
  'athee',
  'bouddh',
  'hindou',
  'terroris',
  'jihad',
  'daech',
  'isis',
  'etat islamique',
  'al.qaida',
  'boko',
  'extremis',
  'laicite',
  'voile interdit',
  'actualite',
  'politics',
  '\\bwar\\b',
  'autres religions',
  'meilleure religion',
  'fausses? religions?',
  'califat',
  'caliphate',
]);
const EXTREMISME = R([
  'boko',
  'daech',
  'isis',
  'terroris',
  'al.qaida',
  'etat islamique',
  'califat',
]);
const PERSO = R([
  'mon adresse',
  'mon numero',
  'mon telephone',
  'j.habite',
  'mon ecole s.appelle',
  'mon nom de famille',
  'ma photo',
  'mon mail',
  'mon email',
  'mon e.mail',
  '\\b0[1-9]( ?\\d{2}){4}\\b',
  '\\+?221 ?\\d',
  // numéro mobile sénégalais sans indicatif (77 123 45 67)
  '\\b7[05678]( ?\\d){7}\\b',
  '\\+33',
  '@[a-z0-9_.-]+\\.[a-z]{2,}',
  'my address',
  'my phone',
]);
const CORAN = R([
  'ecri[st].{0,12}(sourate|verset|coran|ayat|surat)',
  'donne.{0,12}(sourate|verset|la suite)',
  'la suite (de|du)',
  'recite',
  'corrige (ce|mon|le) verset',
  'texte (de la|du) (sourate|verset)',
  '(sourate|verset).{0,30}phoneti',
  'phoneti',
  'en lettres latines',
  'transcri',
  'ecri[st].{0,15}(en|avec des) (lettres )?(francais|latin)',
  'write (the )?(surah|verse)',
  'next verse',
  'copie (la|le) (sourate|verset)',
  'ayat al.kursi',
  'ayatoul koursi',
  'fatiha',
  'سورة',
  'آية',
]);
const HADITH = R([
  'hadith',
  'hadit',
  'hadis',
  'le prophete a dit',
  'le prophete (a|aurait) (dit|parle)',
  'sunna',
  'sounna',
  'boukhari',
  'bukhari',
  'mouslim',
  'muslim \\d',
  'tirmidhi',
  'tirmidi',
  'abu dawud',
  'abou daoud',
  'nasa.i',
  'ibn maja',
  'numero du hadith',
  'prophet said',
  'حديث',
  'قال رسول',
  'قال النبي',
]);
const IDENTITE = R([
  'es.tu (un|une) (humain|personne|robot|ia|programme)',
  'tu es (un|une) (humain|personne|ami)',
  'es.tu mon ami',
  'tu t.appelles',
  'comment tu t.appelles',
  'quel est ton (nom|prenom)',
  'qui es.tu',
  'are you human',
]);

/**
 * Forme COMPACTE (audit CON-12) : chiffres et symboles « leet » ramenés aux lettres, tout ce qui n'est pas une
 * lettre retiré — « su1cider », « sui cider », « I G N O R E » ne passent plus. Usage interne seulement.
 */
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};
export function compact(folded: string): string {
  let out = '';
  for (const ch of folded) {
    const c = LEET[ch] ?? ch;
    if (/[a-z\u0621-\u064A]/.test(c)) out += c;
  }
  return out;
}
const DETRESSE_COMPACT = R([
  'suicid',
  'metuer',
  'veuxmourir',
  'enviedemourir',
  'enfinir',
  'plusvivre',
  'mefrapp',
  'mecogn',
  'metabass',
  'mependre',
  'killmyself',
  'wanttodie',
]);
const INJECTION_COMPACT = R([
  'ignoretes',
  'ignorelesinstructions',
  'ignoreyour',
  'ignoreall',
  'oublietes',
]);

export function classify(text: string): Category {
  const t = fold(text);
  const k = compact(t);
  // détresse : on préfère un faux positif (un adulte relit) à un appel à l'aide manqué
  if (DETRESSE.test(t) || DETRESSE_COMPACT.test(k)) return 'detresse';
  if (RENCONTRE.test(t)) return 'rencontre';
  if (INJECTION.test(t) || INJECTION_COMPACT.test(k)) return 'injection';
  if (EXTREMISME.test(t)) return 'polemique';
  if (AVIS.test(t)) return 'avis_religieux';
  if (POLEMIQUE.test(t)) return 'polemique';
  if (PERSO.test(t)) return 'donnees_perso';
  if (HADITH.test(t)) return 'hadith';
  if (CORAN.test(t)) return 'coran_texte';
  if (IDENTITE.test(t)) return 'identite';
  return 'normal';
}

/** Numéros d'aide par pays (table datée : ADAPTATION_PAYS, à revérifier avant ouverture). */
export const HELPLINES: Record<string, string> = {
  SN: '116 (Sénégal, ligne verte enfance, gratuit)',
  FR: '119 (Allô Enfance en Danger, gratuit, 24 h/24)',
  BE: '103 (Écoute-Enfants)',
  CH: '147 (Pro Juventute)',
  CA: '1 800 668-6868 (Jeunesse, J’écoute)',
  MA: '2511 (numéro enfance)',
  CI: '116 (ligne enfance)',
  ML: '116',
  US: '988 (Suicide & Crisis Lifeline)',
  GB: '0800 1111 (Childline)',
};
export function helpline(country?: string | null): string {
  return (
    (country && HELPLINES[country.toUpperCase()]) || '112 (urgences) ou un adulte de confiance'
  );
}
