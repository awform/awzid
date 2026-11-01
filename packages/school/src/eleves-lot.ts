/**
 * V2-5 : élèves créés en liste par l'enseignant — fonctions PURES, partagées par le serveur et l'application
 * (sans dépendance, utilisables dans le navigateur) :
 *  - lecture d'une liste saisie ou collée depuis un tableur (prénom + année de naissance, une ligne par élève) ;
 *  - translittération simple de l'arabe en lettres latines (identifiant, étiquette imprimée) ;
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

/** Plusieurs colonnes de texte et aucune ne se reconnaît comme « prénom » : l'enseignant choisit. */
export interface ColonneAmbigue {
  /** intitulés (ligne d'en-tête) ou « Colonne n » ; seules les colonnes de texte */
  colonnes: Array<{ index: number; titre: string }>;
  /** la première ligne de données, pour que l'enseignant reconnaisse la colonne */
  apercu: string[];
  /** vrai : la colonne est connue mais ses cellules ont plusieurs mots ; l'enseignant dit l'ordre (nom puis prénom, ou l'inverse) */
  ordre?: boolean;
}

const ANNEE_MIN = 1990;
/** signes de commande et d'orientation : jamais dans un prénom (ZWNJ U+200C et ZWJ U+200D sont permis : écriture persane) */
function interdit(cp: number): boolean {
  return (
    cp < 0x20 ||
    cp === 0x7f ||
    cp === 0x3c || // <
    cp === 0x3e || // >
    cp === 0x7b || // {
    cp === 0x7d || // }
    cp === 0x5c || // \
    cp === 0x200b ||
    cp === 0x200e ||
    cp === 0x200f ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069)
  );
}

const PRENOM = new RegExp("^[\\p{L}\\p{M}](?:[\\p{L}\\p{M} '’.-]|\\u200c|\\u200d)*$", 'u');

export function prenomValide(p: string): boolean {
  const s = p.trim();
  if (s.length < 1 || s.length > 40) return false;
  for (const ch of s) if (interdit(ch.codePointAt(0)!)) return false;
  return PRENOM.test(s) && /\p{L}/u.test(s);
}

/** Le premier mot seulement : jamais de nom de famille (minimisation). « Fatou Bintou Diop » → « Fatou ». */
export function premierMot(s: string): string {
  return (s ?? '').trim().split(/\s+/u)[0] ?? '';
}

// ------------------------------------------------------------------ translittération de l'arabe

/**
 * Normalisation NFKC du PRÉNOM SAISI seulement (formes de présentation arabes, lettres pleine chasse…), avant la
 * translittération. Jamais appliquée à un texte du Coran ni d'un livre.
 */
export function normaliserPrenom(s: string): string {
  // eslint-disable-next-line no-restricted-syntax -- prénom saisi par l'enseignant, jamais un texte coranique
  return (s ?? '').normalize('NFKC');
}

/** lettres latines étendues (peul, etc.) sans équivalent dans les polices standard */
const LATIN_ETENDU: Record<string, string> = {
  ɓ: 'b',
  Ɓ: 'B',
  ɗ: 'd',
  Ɗ: 'D',
  ŋ: 'ng',
  Ŋ: 'Ng',
  ƴ: 'y',
  Ƴ: 'Y',
  ɲ: 'ny',
  Ɲ: 'Ny',
};

const AR: Record<string, string> = {
  ا: 'a',
  أ: 'a',
  إ: 'i',
  آ: 'a',
  ٱ: 'a',
  ء: '',
  ؤ: 'u',
  ئ: 'i',
  ب: 'b',
  پ: 'p',
  ت: 't',
  ث: 'th',
  ج: 'j',
  چ: 'ch',
  ح: 'h',
  خ: 'kh',
  د: 'd',
  ذ: 'dh',
  ر: 'r',
  ز: 'z',
  ژ: 'zh',
  س: 's',
  ش: 'sh',
  ص: 's',
  ض: 'd',
  ط: 't',
  ظ: 'z',
  ع: 'a',
  غ: 'gh',
  ف: 'f',
  ڤ: 'v',
  ق: 'q',
  ك: 'k',
  ک: 'k',
  گ: 'g',
  ل: 'l',
  م: 'm',
  ن: 'n',
  ه: 'h',
  ہ: 'h',
  ھ: 'h',
  ة: 'a',
  و: 'w',
  ي: 'y',
  ی: 'y',
  ى: 'a',
};
/** voyelles brèves, tanwīn, šadda, sukūn, alif suscrit, allongement (kashida), liants invisibles */
function estMarque(cp: number): boolean {
  return (
    (cp >= 0x610 && cp <= 0x61a) ||
    (cp >= 0x64b && cp <= 0x65f) ||
    cp === 0x670 ||
    cp === 0x640 ||
    (cp >= 0x6d6 && cp <= 0x6ed) ||
    cp === 0x200c ||
    cp === 0x200d
  );
}
const sansMarques = (s: string) => [...s].filter((c) => !estMarque(c.codePointAt(0)!)).join('');
const VOYELLES = /[aeiou]/;

/**
 * Translittération SIMPLE de l'arabe en lettres latines, pour la base d'un identifiant et pour l'étiquette imprimée :
 * « أمينة » → « amina », « موسى » → « musa », « علي » → « ali ». Les voyelles brèves ne s'écrivent pas : « و » et
 * « ي » donnent « u » et « i » entre deux lettres, « w » et « y » en tête de mot ; un mot sans aucune voyelle reçoit un
 * « a » après chaque consonne sauf la dernière. Ce n'est pas une transcription savante. Le texte non arabe reste tel quel.
 */
export function translitterer(s: string): string {
  const mots = [...sansMarques(s ?? '')]
    .map((c) => LATIN_ETENDU[c] ?? c)
    .join('')
    .split(/(\s+)/u);
  return mots
    .map((mot) => {
      if (!/[؀-ۿ]/u.test(mot)) return mot;
      const lettres = [...mot];
      let out = '';
      lettres.forEach((ch, i) => {
        const prec = lettres[i - 1];
        const apresDebut = i > 0 && prec !== undefined && prec in AR && !'اأإآٱ'.includes(prec);
        if ((ch === 'و' || ch === 'ؤ') && apresDebut) out += 'u';
        else if ((ch === 'ي' || ch === 'ی') && apresDebut) out += 'i';
        else out += AR[ch] ?? (/[؀-ۿ]/u.test(ch) ? '' : ch);
      });
      out = out.replace(/(a|i|u)\1+/g, '$1');
      if (out.length > 1 && !VOYELLES.test(out)) {
        const l = out.match(/th|kh|dh|sh|gh|ch|zh|./g) ?? [];
        out = l.map((x, k) => (k < l.length - 1 ? `${x}a` : x)).join('');
      }
      return out;
    })
    .join('');
}

// ------------------------------------------------------------------ lecture d'une liste collée

/** minuscules, sans accents ni voyelles arabes, séparateurs ramenés à l'espace (pour reconnaître un intitulé) */
function normaliser(s: string): string {
  const carte: Record<string, string> = {
    à: 'a',
    á: 'a',
    â: 'a',
    ä: 'a',
    ã: 'a',
    ç: 'c',
    è: 'e',
    é: 'e',
    ê: 'e',
    ë: 'e',
    ì: 'i',
    í: 'i',
    î: 'i',
    ï: 'i',
    ñ: 'n',
    ò: 'o',
    ó: 'o',
    ô: 'o',
    ö: 'o',
    ù: 'u',
    ú: 'u',
    û: 'u',
    ü: 'u',
    ß: 'ss',
    أ: 'ا',
    إ: 'ا',
    آ: 'ا',
  };
  return sansMarques(s.toLowerCase())
    .replace(/[^\p{L}\p{N} ]|_/gu, ' ')
    .replace(/./gu, (c) => carte[c] ?? c)
    .replace(/\s+/g, ' ')
    .trim();
}

/** intitulés qui désignent SANS ambiguïté le prénom (cinq langues) */
const PRENOM_SUR = new Set(
  [
    'prénom',
    'prénoms',
    'first name',
    'firstname',
    'given name',
    'given names',
    'forename',
    'vorname',
    'nombre de pila',
    'primer nombre',
    'الاسم الأول',
    'الاسم الاول',
    'اسم أول',
    'اسم اول',
    'الاسم الشخصي',
    'الاسم الصغير',
  ].map(normaliser),
);
/** intitulés du nom de famille (jamais pris) */
const NOM_FAMILLE = new Set(
  [
    'nom',
    'nom de famille',
    'surname',
    'last name',
    'lastname',
    'family name',
    'nachname',
    'familienname',
    'apellido',
    'apellidos',
    'اللقب',
    'اسم العائلة',
    'الاسم العائلي',
    'العائلة',
  ].map(normaliser),
);
/** intitulés de l'année ou de la date de naissance */
const ANNEE_TITRE = new Set(
  [
    'année',
    'an',
    'annee de naissance',
    'année de naissance',
    'date de naissance',
    'naissance',
    'year',
    'year of birth',
    'birth year',
    'birth date',
    'date of birth',
    'born',
    'año',
    'año de nacimiento',
    'fecha de nacimiento',
    'jahr',
    'geburtsjahr',
    'jahrgang',
    'geburtsdatum',
    'السنة',
    'سنة الميلاد',
    'تاريخ الميلاد',
    'الميلاد',
  ].map(normaliser),
);
/** intitulés trop généraux pour désigner le prénom (« name », « nombre »…) : reconnus comme en-tête, pas comme prénom */
const AMBIGUS = new Set(
  [
    'name',
    'nombre',
    'nom prénom',
    'nom et prénom',
    'الاسم',
    'اسم',
    'classe',
    'class',
    'clase',
    'klasse',
    'القسم',
  ].map(normaliser),
);
const CONNUS = new Set([...PRENOM_SUR, ...NOM_FAMILLE, ...ANNEE_TITRE, ...AMBIGUS]);
/** la première ligne est-elle une ligne d'intitulés ? (un seul intitulé connu suffit ; jamais un prénom ordinaire) */
function estEntete(cells: string[], ligne: string): boolean {
  if (cells.some((c) => CONNUS.has(normaliser(c)))) return true;
  const mots = normaliser(ligne).split(' ');
  return mots.length > 1 && mots.every((m) => CONNUS.has(m));
}

const estNombre = (c: string) => /^[\d\s/.-]*$/.test(c);

/** séparateur d'une ligne : tabulation (tableur), sinon « ; », sinon « , » ; aucun : une seule cellule */
function separer(ligne: string): string[] {
  const sep = ligne.includes('\t')
    ? '\t'
    : ligne.includes(';')
      ? ';'
      : ligne.includes(',')
        ? ','
        : null;
  const cellules = sep ? ligne.split(sep) : [ligne];
  return cellules.map((c) => c.replace(/^["'\s]+|["'\s]+$/g, '').trim());
}

/**
 * Lit un texte collé d'un tableur (colonnes séparées par une tabulation, « ; » ou « , ») ou saisi à la main
 * (« Moussa 2017 »). L'année est le nombre de 4 chiffres de la ligne (une date « 12/03/2017 » donne 2017).
 * La colonne « prénom » est repérée d'après la ligne d'en-tête (français, anglais, espagnol, allemand, arabe) ; le
 * nom de famille n'est jamais pris, et seul le PREMIER MOT du prénom est gardé. Plusieurs colonnes de texte sans
 * intitulé reconnu : `ambigu` est renvoyé (rien n'est lu) et l'enseignant choisit la colonne (`colonnePrenom`).
 * Lignes vides ignorées.
 */
export function lireListeEleves(
  texte: string,
  anneeCourante = new Date().getUTCFullYear(),
  colonnePrenom?: number,
  /** ordre des mots d'une cellule « nom et prénom » (choisi par l'enseignant) */
  ordre?: 'nom-prenom' | 'prenom-nom',
): { eleves: LigneEleve[]; rejets: RejetLigne[]; ambigu?: ColonneAmbigue } {
  const eleves: LigneEleve[] = [];
  const rejets: RejetLigne[] = [];
  const t0 = texte ?? '';
  const brut = t0.charCodeAt(0) === 0xfeff ? t0.slice(1) : t0;
  const lignes = brut.split(/\r\n|\r|\n/);
  const utiles = lignes
    .map((l, i) => ({ numero: i + 1, ligne: l.trim() }))
    .filter((x) => x.ligne.length > 0);
  const avecAnnee = (l: string) => /(?<!\d)(\d{4})(?!\d)/.test(l);

  // ligne d'en-tête : la première, sans année, qui ressemble à des intitulés
  let enteteCells: string[] | null = null;
  const premiere = utiles[0];
  if (premiere && !avecAnnee(premiere.ligne)) {
    const cells = separer(premiere.ligne);
    if (estEntete(cells, premiere.ligne)) {
      enteteCells = cells;
      utiles.shift();
    }
  }
  const donnees = utiles.map((x) => ({ ...x, cellules: separer(x.ligne) }));
  const colsTexte = (cells: string[]) =>
    cells.map((c, i) => (c && !estNombre(c) ? i : -1)).filter((i) => i >= 0);

  // colonne du prénom. `sure` : l'intitulé dit « prénom » sans ambiguïté (sinon, plusieurs mots dans la cellule
  // ne se tranchent pas seuls : « DIOP Fatou » ou « Fatou DIOP » ?)
  let col: number | null = null;
  let sure = false;
  if (colonnePrenom !== undefined) col = colonnePrenom;
  else if (enteteCells && enteteCells.length > 1) {
    const normes = enteteCells.map(normaliser);
    const sures = normes.map((n, i) => (PRENOM_SUR.has(n) ? i : -1)).filter((i) => i >= 0);
    if (sures.length === 1) {
      col = sures[0]!;
      sure = true;
    } else if (sures.length === 0) {
      // ni « prénom » ni autre : s'il ne reste qu'une colonne hors nom de famille, année et intitulé général, c'est elle
      const restes = normes
        .map((n, i) =>
          n && !NOM_FAMILLE.has(n) && !ANNEE_TITRE.has(n) && !AMBIGUS.has(n) ? i : -1,
        )
        .filter((i) => i >= 0);
      if (restes.length === 1) col = restes[0]!;
    }
  } else if (!enteteCells || enteteCells.length <= 1) {
    const maxTexte = Math.max(0, ...donnees.map((d) => colsTexte(d.cellules).length));
    if (maxTexte <= 1 && !enteteCells) col = -1; // une seule colonne de texte : la première de chaque ligne
  }
  if (col === null && donnees.length) {
    const ref = donnees[0]!.cellules;
    const titres = enteteCells ?? [];
    return {
      eleves: [],
      rejets: [],
      ambigu: {
        colonnes: colsTexte(ref).map((i) => ({ index: i, titre: titres[i] || `#${i + 1}` })),
        apercu: ref,
      },
    };
  }

  const lus: Array<{ nom: string; annee: number; numero: number; texte: string }> = [];
  for (const d of donnees) {
    const rejet = (code: CodeRejet) => rejets.push({ ligne: d.numero, texte: d.ligne, code });
    const annees = [...d.ligne.matchAll(/(?<!\d)(\d{4})(?!\d)/g)].map((m) => m[1]!);
    if (annees.length === 0) {
      rejet('annee_manquante');
      continue;
    }
    // dernière année de la ligne (dans « 12/03/2017 » c'est la seule ; dans « Awa 2017 » aussi)
    const annee = Number(annees[annees.length - 1]);
    if (annee < ANNEE_MIN || annee > anneeCourante) {
      rejet('annee_invalide');
      continue;
    }
    let nom: string;
    if (d.cellules.length > 1) {
      const i = col !== null && col >= 0 ? col : colsTexte(d.cellules)[0];
      nom = i === undefined ? '' : (d.cellules[i] ?? '');
    } else {
      nom = d.ligne.replace(/[\s/.-]*\d{4}[\s/.-]*$/, '').replace(/^["']+|["']+$/g, '');
      if (!nom || nom === d.ligne) nom = d.ligne.replace(/\d+/g, ' ').trim();
    }
    nom = nom.replace(/\s+/g, ' ').trim();
    if (!nom || estNombre(nom)) {
      rejet('prenom_manquant');
      continue;
    }
    lus.push({ nom, annee, numero: d.numero, texte: d.ligne });
  }

  // plusieurs mots dans une cellule dont l'intitulé ne dit pas « prénom » : l'enseignant dit dans quel ordre
  if (!sure && ordre === undefined) {
    const multi = lus.find((x) => x.nom.includes(' '));
    if (multi)
      return { eleves: [], rejets: [], ambigu: { colonnes: [], apercu: [multi.nom], ordre: true } };
  }
  for (const x of lus) {
    const mots = x.nom.split(' ');
    // « nom puis prénom » : le prénom est le deuxième mot ; sinon le premier. Jamais le nom de famille.
    const prenom = !sure && ordre === 'nom-prenom' ? (mots[1] ?? mots[0]!) : mots[0]!;
    if (!prenomValide(prenom)) {
      rejets.push({ ligne: x.numero, texte: x.texte, code: 'prenom_invalide' });
      continue;
    }
    eleves.push({ prenom, annee: x.annee });
  }
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
