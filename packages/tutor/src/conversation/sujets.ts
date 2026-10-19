/**
 * SUJETS HORS PÉRIMÈTRE du tuteur de conversation (20/10/2026, règles annoncées au client), en plus de la religion :
 *  - « politique » : politique et actualité qui divise (élections, partis, dirigeants, guerres et conflits, colonisation,
 *    manifestations, immigration…) ;
 *  - « inconvenant » : relations amoureuses et sexualité, violence, alcool, drogue, jeux d'argent, vulgarité, magie et
 *    voyance — contenus contraires aux valeurs d'une école musulmane ; règle PLUS STRICTE pour les ados (aucune allusion
 *    amoureuse : petit ami, amoureux, bisou…) ;
 *  - « conseil » : conseil médical, juridique ou financier (médicament, posologie, procès, placement, crédit…).
 *
 * Même principe que pour la religion : repérés AVANT l'appel au modèle quand c'est possible (texte écrit : refus poli,
 * aucun coût) ; sur la transcription (voix) ; et dans la réponse du modèle (filtre de sortie). Détection
 * DÉTERMINISTE, prudente : les mots du programme (médecin, malade, famille, marché, couteau de cuisine…) ne sont pas
 * visés ; seules des tournures sans ambiguïté le sont. L'invite demande aussi au modèle de refuser (seconde barrière).
 */
import { bareWords } from '../arabic.js';
import { fold } from '../classify.js';
import type { Audience } from '../types.js';

export type SujetSensible = 'politique' | 'inconvenant' | 'conseil';

const R = (parts: string[]) => new RegExp(parts.join('|'));

/** Français et anglais, sur la forme pliée (minuscules, sans accents). */
const POLITIQUE_FR = R([
  'politi(que|cien|cs)',
  '\\belections?\\b',
  'electoral',
  '\\bvoter (pour|contre)',
  'pour qui (voter|tu votes|vous votez)',
  'parti (politique|socialiste|republicain|communiste)',
  'extreme (droite|gauche)',
  '(la|de) (gauche|droite) (politique|au pouvoir)',
  '\\bpresident (de la republique|macron|trump|poutine|biden|sall|faye|diomaye)',
  '\\b(macron|trump|poutine|putin|biden|netanyahou?|zelensky|le pen|melenchon|sonko|macky sall|diomaye)\\b',
  'gouvernement',
  '\\bministre',
  'guerre',
  '\\bwar\\b',
  'conflit (israel|en|au|a)',
  'israel',
  'palestin',
  '\\bgaza\\b',
  'ukrain',
  'colonis',
  'manifestation',
  '\\bgreve\\b',
  'immigration',
  'migrants?\\b',
  'actualite',
  '\\bnews\\b',
  'coup d.etat',
  'revolution',
]);
const POLITIQUE_AR = [
  'سياسة',
  'سياسي',
  'سياسية',
  'انتخابات',
  'انتخاب',
  'حزب',
  'أحزاب',
  'حكومة',
  'برلمان',
  'حرب',
  'الحرب',
  'احتلال',
  'مظاهرة',
  'مظاهرات',
  'ثورة',
  'انقلاب',
  'إسرائيل',
  'فلسطين',
  'غزة',
  'أوكرانيا',
  'استعمار',
];

const INCONVENANT_FR = R([
  'sexe',
  'sexuel',
  'porno?',
  '\\bnues?\\b',
  'nudite',
  'coucher avec',
  'faire l.amour',
  'preservatif',
  'draguer',
  '\\bdrague\\b',
  'seduire',
  'rencard',
  '\\bsexy\\b',
  'violence',
  'violent',
  'pistolet',
  'fusil',
  'arme a feu',
  '\\barmes?\\b',
  '\\bbombe',
  'tuer (quelqu|des gens|un homme|une femme|mon|ma|son|sa|le|la)',
  'comment tuer',
  'bagarre',
  'massacre',
  'decapit',
  'tortur',
  '\\bgore\\b',
  'drogue',
  'cannabis',
  '\\bshit\\b',
  'cocaine',
  'heroine',
  'fumer (un joint|de l.herbe)',
  '\\bjoint\\b',
  'alcool',
  'biere',
  '\\bvin (rouge|blanc)',
  'whisky',
  'vodka',
  '\\bivre\\b',
  'saoul',
  'se bourrer',
  'casino',
  'paris sportifs',
  'parier',
  '\\bpoker\\b',
  '\\bloto\\b',
  'jeux d.argent',
  'sorcellerie',
  'voyance',
  'voyant(e)?\\b',
  'horoscope',
  'astrologie',
  '\\bpute\\b',
  'salope',
  'connard',
  'encule',
  '\\bnique\\b',
  '\\bmerde\\b',
  '\\bfuck',
  '\\bbitch\\b',
  '\\bsex\\b',
]);
/** Adolescents : AUCUNE allusion amoureuse (règle plus stricte). */
const INCONVENANT_ADO_FR = R([
  'amoureu',
  'petite? amie?\\b',
  'petit copain',
  'ma copine',
  '\\bcrush\\b',
  '\\bbisous?\\b',
  'embrass',
  'je t.aime',
  'rendez.vous (galant|amoureux)',
  '\\bflirt',
  'mon mec\\b',
  'ma meuf\\b',
  'sortir avec (elle|lui|toi|moi)\\b',
  'girlfriend',
  'boyfriend',
]);
const INCONVENANT_AR = [
  'إباحي',
  'إباحية',
  'عاري',
  'عارية',
  'جنسي',
  'جنسيا',
  'خمر',
  'الخمر',
  'كحول',
  'مخدرات',
  'حشيش',
  'سكران',
  'بيرة',
  'نبيذ',
  'قمار',
  'رهان',
  'يانصيب',
  'سلاح',
  'أسلحة',
  'مسدس',
  'قنبلة',
  'تعذيب',
  'سحر',
  'ساحر',
  'شعوذة',
];
const INCONVENANT_ADO_AR = ['حبيبتي', 'عشيقة', 'عشيق', 'غرام', 'أعشق', 'يغازل', 'قبلة حب'];

const CONSEIL_FR = R([
  // médical (demande de conseil, pas le vocabulaire des leçons : médecin, malade, j'ai mal…)
  'quel(s|le)? medicament',
  'medicament (pour|contre)',
  'posologie',
  '\\bdose (de|pour)',
  'ordonnance',
  'antibiotique',
  'paracetamol',
  'doliprane',
  'ibuprofen',
  'quel traitement',
  'traitement (pour|contre)',
  'dois.je (prendre|arreter) (un|une|des|le|la|mon|ma|mes)',
  'diagnosti',
  'symptome',
  'suis.je malade',
  'est.ce (grave|dangereux) (si|de|pour)',
  // juridique
  'porter plainte',
  'proces\\b',
  'tribunal',
  'juridique',
  'mes droits',
  'avocat (pour|specialise)',
  'contrat de travail',
  'licenci',
  'titre de sejour',
  'naturalisation',
  'prefecture',
  // financier
  'investi(r|ssement)',
  'placement',
  'placer (mon|de l.|son) argent',
  'crypto',
  'bitcoin',
  'en bourse',
  'trading',
  '\\bforex\\b',
  '\\bcredit (immobilier|a la consommation|auto)',
  'pret (immobilier|bancaire)',
  'emprunter de l.argent',
  '\\bimpots?\\b',
  'epargne',
  'assurance.vie',
  'quelle banque',
  'devenir riche',
  'gagner de l.argent (vite|facilement|en ligne)',
]);
const CONSEIL_AR = [
  'أي دواء',
  'جرعة',
  'مضاد حيوي',
  'وصفة طبية',
  'محامي',
  'محكمة',
  'دعوى',
  'قانوني',
  'استثمار',
  'أستثمر',
  'بورصة',
  'أسهم',
  'عملة رقمية',
  'بيتكوين',
  'قرض',
  'ضرائب',
  'تداول',
];

/** Préfixes arabes retirés avant comparaison (و، ف، ب، ل، ك، ال…). */
const PREFIXES = /^(وال|فال|بال|كال|لل|ال|و|ف|ب|ل|ك)/;

/** Liste arabe → formes nues (mots seuls ou expressions de plusieurs mots). */
function formes(liste: readonly string[]): { mots: Set<string>; expressions: string[] } {
  const mots = new Set<string>();
  const expressions: string[] = [];
  for (const x of liste) {
    const w = bareWords(x);
    if (w.length === 1) mots.add(w[0]!.replace(PREFIXES, '') || w[0]!);
    else if (w.length > 1) expressions.push(` ${w.join(' ')} `);
  }
  return { mots, expressions };
}
const AR = {
  politique: formes(POLITIQUE_AR),
  inconvenant: formes(INCONVENANT_AR),
  inconvenantAdo: formes(INCONVENANT_ADO_AR),
  conseil: formes(CONSEIL_AR),
};

function arabeContient(texte: string, f: { mots: Set<string>; expressions: string[] }): boolean {
  const ws = bareWords(texte);
  if (!ws.length) return false;
  const phrase = ` ${ws.join(' ')} `;
  if (f.expressions.some((e) => phrase.includes(e))) return true;
  return ws.some((w) => f.mots.has(w) || f.mots.has(w.replace(PREFIXES, '')));
}

/**
 * Sujet sensible repéré dans ce que l'élève a écrit ou dit (null : rien). `ado` : règle plus stricte.
 * Ordre : inconvenant (protection des valeurs) avant conseil et politique.
 */
export function sujetSensible(texte: string, audience: Audience = 'adulte'): SujetSensible | null {
  if (!texte) return null;
  const t = fold(texte);
  const strict = audience !== 'adulte';
  if (
    INCONVENANT_FR.test(t) ||
    arabeContient(texte, AR.inconvenant) ||
    (strict && (INCONVENANT_ADO_FR.test(t) || arabeContient(texte, AR.inconvenantAdo)))
  )
    return 'inconvenant';
  if (CONSEIL_FR.test(t) || arabeContient(texte, AR.conseil)) return 'conseil';
  if (POLITIQUE_FR.test(t) || arabeContient(texte, AR.politique)) return 'politique';
  return null;
}

/**
 * Filtre de SORTIE : la réponse du modèle (français et arabe) parle-t-elle d'un sujet hors périmètre ? Toujours avec la
 * règle stricte (le tuteur n'emploie jamais un mot amoureux, quel que soit l'âge de l'élève).
 */
export const sujetSensibleSortie = (fr: string, ar: string): SujetSensible | null =>
  sujetSensible(`${fr}\n${ar}`, 'ado');
