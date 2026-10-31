/**
 * « Voir le tracé » — textes d'interface (aucun texte de contenu, aucun texte religieux), dans les 5 langues de
 * l'application, embarqués dans ce morceau chargé à la demande : ils ne pèsent donc pas sur l'appareil de l'élève
 * avant le premier usage. Langue absente : français.
 */
import { locale } from '$lib/i18n';

type Tx = Record<string, string>;

export const TEXTES: Record<'fr' | 'en' | 'es' | 'de' | 'ar', Tx> = {
  fr: {
    lire: 'Lire',
    pause: 'Pause',
    rejouer: 'Rejouer',
    vitesse: 'Vitesse',
    base: 'Ligne de base',
    anim: 'Tracé animé',
    trait: 'Trait {n} sur {total}',
    points: 'Les points et les signes',
    fini: 'Tracé terminé',
    a_confirmer: 'Tracé usuel, à confirmer par ton enseignant.',
    calme: 'Animation réduite : appuie sur Lire pour voir le tracé.',
    clavier:
      'Clavier : Espace lit ou met en pause, R rejoue, flèches haut et bas changent la vitesse.',
    image:
      'Tracé de {l}, forme {forme} : {n, plural, one {# trait} other {# traits}}, de droite à gauche.',
    isolee: 'isolée',
    debut: 'au début',
    milieu: 'au milieu',
    fin: 'à la fin',
    lettres: 'Lettres',
    formes: 'Formes',
    planche: 'Planche de toutes les lettres',
    choisis: 'Choisis une lettre et une forme.',
    chargement: 'Chargement du tracé…',
    indisponible: 'Les tracés ne sont pas disponibles pour le moment. Réessaie avec une connexion.',
    absente: 'Cette forme n’existe pas pour cette lettre.',
    confirmer_marque: 'à confirmer',
  },
  en: {
    lire: 'Play',
    pause: 'Pause',
    rejouer: 'Replay',
    vitesse: 'Speed',
    base: 'Baseline',
    anim: 'Animated stroke order',
    trait: 'Stroke {n} of {total}',
    points: 'The dots and marks',
    fini: 'Writing finished',
    a_confirmer: 'Usual stroke order, to be confirmed by your teacher.',
    calme: 'Reduced motion: press Play to see the writing.',
    clavier: 'Keyboard: Space plays or pauses, R replays, Up and Down arrows change the speed.',
    image:
      'Writing of {l}, {forme} form: {n, plural, one {# stroke} other {# strokes}}, right to left.',
    isolee: 'isolated',
    debut: 'initial',
    milieu: 'medial',
    fin: 'final',
    lettres: 'Letters',
    formes: 'Forms',
    planche: 'Chart of all the letters',
    choisis: 'Choose a letter and a form.',
    chargement: 'Loading the writing…',
    indisponible:
      'The writing animations are not available right now. Try again with a connection.',
    absente: 'This form does not exist for this letter.',
    confirmer_marque: 'to be confirmed',
  },
  es: {
    lire: 'Reproducir',
    pause: 'Pausa',
    rejouer: 'Repetir',
    vitesse: 'Velocidad',
    base: 'Línea de base',
    anim: 'Trazo animado',
    trait: 'Trazo {n} de {total}',
    points: 'Los puntos y los signos',
    fini: 'Trazo terminado',
    a_confirmer: 'Trazo habitual, que debe confirmar tu profesor.',
    calme: 'Movimiento reducido: pulsa Reproducir para ver el trazo.',
    clavier:
      'Teclado: Espacio reproduce o pausa, R repite, las flechas arriba y abajo cambian la velocidad.',
    image:
      'Trazo de {l}, forma {forme}: {n, plural, one {# trazo} other {# trazos}}, de derecha a izquierda.',
    isolee: 'aislada',
    debut: 'inicial',
    milieu: 'media',
    fin: 'final',
    lettres: 'Letras',
    formes: 'Formas',
    planche: 'Tabla de todas las letras',
    choisis: 'Elige una letra y una forma.',
    chargement: 'Cargando el trazo…',
    indisponible: 'Los trazos no están disponibles por ahora. Inténtalo de nuevo con conexión.',
    absente: 'Esta forma no existe para esta letra.',
    confirmer_marque: 'por confirmar',
  },
  de: {
    lire: 'Abspielen',
    pause: 'Pause',
    rejouer: 'Nochmal',
    vitesse: 'Geschwindigkeit',
    base: 'Grundlinie',
    anim: 'Animierte Schreibweise',
    trait: 'Strich {n} von {total}',
    points: 'Die Punkte und Zeichen',
    fini: 'Schreiben beendet',
    a_confirmer: 'Übliche Strichfolge, von deiner Lehrkraft zu bestätigen.',
    calme: 'Reduzierte Bewegung: Drücke Abspielen, um das Schreiben zu sehen.',
    clavier:
      'Tastatur: Leertaste spielt oder pausiert, R wiederholt, Pfeil hoch und runter ändern die Geschwindigkeit.',
    image:
      'Schreibweise von {l} ({forme}): {n, plural, one {# Strich} other {# Striche}}, von rechts nach links.',
    isolee: 'isolierte Form',
    debut: 'Anfangsform',
    milieu: 'Mittelform',
    fin: 'Endform',
    lettres: 'Buchstaben',
    formes: 'Formen',
    planche: 'Tafel aller Buchstaben',
    choisis: 'Wähle einen Buchstaben und eine Form.',
    chargement: 'Schreibweise wird geladen…',
    indisponible:
      'Die Schreibweisen sind im Moment nicht verfügbar. Versuche es mit Verbindung erneut.',
    absente: 'Diese Form gibt es für diesen Buchstaben nicht.',
    confirmer_marque: 'zu bestätigen',
  },
  ar: {
    lire: 'تَشْغِيل',
    pause: 'إِيقَاف مُؤَقَّت',
    rejouer: 'إِعَادَة',
    vitesse: 'السُّرْعَة',
    base: 'خَطُّ الْأَسَاس',
    anim: 'كِتَابَةٌ مُتَحَرِّكَة',
    trait: 'الْخَطُّ {n} مِنْ {total}',
    points: 'النِّقَاطُ وَالْعَلَامَات',
    fini: 'انْتَهَتِ الْكِتَابَة',
    a_confirmer: 'هَذِهِ الطَّرِيقَةُ الْمُعْتَادَة، وَيُؤَكِّدُهَا مُعَلِّمُك.',
    calme: 'حَرَكَةٌ مُخَفَّفَة: اضْغَطْ تَشْغِيل لِرُؤْيَةِ الْكِتَابَة.',
    clavier:
      'لوحة المفاتيح: المسافة للتشغيل أو الإيقاف، وحرف R للإعادة، والسهمان لأعلى ولأسفل للسرعة.',
    image: 'كِتَابَةُ {l}، شَكْلُ {forme}: {n} مِنَ الْخُطُوطِ، مِنَ الْيَمِينِ إِلَى الْيَسَار.',
    isolee: 'الْمُنْفَرِد',
    debut: 'أَوَّل الْكَلِمَة',
    milieu: 'وَسَط الْكَلِمَة',
    fin: 'آخِر الْكَلِمَة',
    lettres: 'الْحُرُوف',
    formes: 'الْأَشْكَال',
    planche: 'لَوْحَةُ كُلِّ الْحُرُوف',
    choisis: 'اِخْتَرْ حَرْفًا وَشَكْلًا.',
    chargement: 'جَارٍ تَحْمِيلُ الْكِتَابَة…',
    indisponible: 'الْكِتَابَةُ غَيْرُ مُتَاحَةٍ الْآن. حَاوِلْ مَرَّةً أُخْرَى مَعَ اتِّصَال.',
    absente: 'هَذَا الشَّكْلُ غَيْرُ مَوْجُودٍ لِهَذَا الْحَرْف.',
    confirmer_marque: 'يُؤَكَّد',
  },
};

/** code de langue pris en charge (sinon français) */
export const langue = (code: string = locale()): keyof typeof TEXTES =>
  (code in TEXTES ? code : 'fr') as keyof typeof TEXTES;

/** texte d'interface dans la langue courante ; `{x}` remplacé, `{n, plural, one {…} other {…}}` géré */
export function tt(key: string, vars: Record<string, string | number> = {}, code?: string): string {
  const L = langue(code);
  let s = TEXTES[L][key] ?? TEXTES.fr[key] ?? key;
  s = s.replace(
    /\{(\w+), plural, one \{([^}]*)\} other \{([^}]*)\}\}/g,
    (_m, k: string, un: string, autres: string) => {
      const n = Number(vars[k]);
      return (n === 1 ? un : autres).replace('#', String(n));
    },
  );
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
