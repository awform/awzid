/**
 * Pages légales (lot 14) — BROUILLONS À FAIRE VALIDER PAR UN JURISTE avant toute ouverture publique.
 * Textes rédigés d'après le fonctionnement RÉEL du code (données collectées, durées, sous-traitants prévus) ;
 * les informations que seul le client peut fournir sont entre crochets « [à compléter] ».
 * Français seulement pour l'instant (les pages indiquent la langue) ; aucune donnée personnelle réelle.
 */
export interface LegalSection {
  titre: string;
  paras: string[];
}
export interface LegalPage {
  titre: string;
  maj: string;
  sections: LegalSection[];
}

export const LEGAL_PAGES = ['mentions', 'cgu', 'confidentialite', 'cookies'] as const;
export type LegalKey = (typeof LEGAL_PAGES)[number];

const MAJ = '29 septembre 2026 (brouillon)';

export const LEGAL: Record<LegalKey, LegalPage> = {
  mentions: {
    titre: 'Mentions légales',
    maj: MAJ,
    sections: [
      {
        titre: 'Éditeur',
        paras: [
          'AWFORM (nom commercial envisagé : Awzid) — [raison sociale, forme juridique, capital : à compléter].',
          'Siège : [adresse à compléter]. Immatriculation : [RCS / SIREN ou NINEA : à compléter].',
          'Directeur ou directrice de la publication : [nom à compléter].',
          'Contact : [adresse électronique de contact à créer].',
        ],
      },
      {
        titre: 'Hébergement',
        paras: [
          "Hébergeur : [hébergeur européen à désigner — nom, adresse, téléphone]. Les données sont hébergées dans l'Union européenne.",
        ],
      },
      {
        titre: 'Propriété intellectuelle',
        paras: [
          "Les livres, leçons, illustrations, exercices et textes AWFORM sont protégés ; toute reproduction hors de l'usage personnel ou scolaire prévu par les conditions d'utilisation est interdite sans autorisation écrite.",
          'Texte coranique : Tanzil (tanzil.net), riwāya Ḥafṣ ʿan ʿĀṣim, reproduit à l’identique, sans aucune modification. Métadonnées du Coran (ajzāʾ, aḥzāb, pages du Muṣḥaf de Médine) : Tanzil.info, licence Creative Commons Attribution 3.0.',
        ],
      },
    ],
  },
  cgu: {
    titre: "Conditions générales d'utilisation",
    maj: MAJ,
    sections: [
      {
        titre: 'Objet',
        paras: [
          "AWFORM est une application d'apprentissage de l'arabe, de mémorisation du Coran (hifẓ) et d'éducation religieuse de base, qui accompagne les livres AWFORM. Les présentes conditions règlent son utilisation.",
        ],
      },
      {
        titre: 'Comptes',
        paras: [
          "Compte parent : réservé à un adulte ; il crée les profils de ses enfants (pseudonyme, année de naissance, niveau) et donne les accords nécessaires. Un enfant n'a jamais d'adresse électronique ni de compte à son nom.",
          'Compte adulte : pour un apprenant majeur. Un mineur ne peut pas ouvrir seul un compte adulte.',
          "Compte enseignant : ouvert par l'établissement, protégé par un second facteur. L'enseignant ne voit que les élèves inscrits dans sa classe par leur parent (code de classe et accord) ou saisis par l'école (classe papier).",
          'Chacun garde son mot de passe secret ; le code parent protège les réglages et les achats.',
        ],
      },
      {
        titre: 'Contenus religieux et tuteur',
        paras: [
          "Le texte coranique affiché vient uniquement du texte de référence Tanzil ; aucun programme ne l'écrit ni ne le retouche. Les hadiths ne sont montrés que s'ils sont marqués « vérifiés » dans le registre des livres.",
          "Le tuteur est un programme : il le dit, il n'émet aucun avis religieux et transmet les questions religieuses à l'enseignant. Il est désactivé par défaut pour les enfants et ne s'active qu'avec l'accord du parent, qui peut lire tout ce qu'il a dit.",
          "Les certificats et attestations délivrés par une école ne sont ni une ijāza, ni un diplôme d'État.",
        ],
      },
      {
        titre: 'Offres, paiement, résiliation',
        paras: [
          "Une offre gratuite permet d'essayer les premières leçons. Les formules payantes, leurs prix et leur durée sont indiqués avant l'achat ; seul l'adulte peut acheter (code parent). Aucune donnée de carte ne passe par AWFORM : le paiement est fait chez le prestataire choisi.",
          "L'abonnement peut être arrêté à tout moment ; les droits restent acquis jusqu'à la fin de la période payée. [Droit de rétractation, remboursement : à compléter selon le pays et le prestataire.]",
        ],
      },
      {
        titre: 'Responsabilité et suspension',
        paras: [
          "L'application est fournie avec soin mais sans garantie d'absence d'interruption. Un compte peut être suspendu en cas d'usage contraire aux présentes conditions ou à la loi, après information de son titulaire sauf urgence.",
        ],
      },
      {
        titre: 'Droit applicable',
        paras: [
          '[Droit applicable et juridiction compétente : à compléter par le juriste — France, Sénégal selon le pays du client.]',
        ],
      },
    ],
  },
  confidentialite: {
    titre: 'Politique de confidentialité',
    maj: MAJ,
    sections: [
      {
        titre: 'Responsable du traitement',
        paras: [
          '[Raison sociale et adresse : à compléter]. Contact pour vos données : [adresse électronique à créer]. Délégué à la protection des données : [à désigner si nécessaire].',
          "Pour une école qui utilise l'espace école (classe papier, résultats, certificats), l'école est responsable des données qu'elle saisit ; AWFORM agit pour son compte (sous-traitant). [Contrat de sous-traitance à prévoir.]",
        ],
      },
      {
        titre: 'Données collectées (le strict nécessaire)',
        paras: [
          "Compte : adresse électronique et mot de passe (protégé, jamais lisible) de l'adulte ; pays ; langue.",
          "Profil d'enfant : pseudonyme, année de naissance (jamais la date complète), niveau, avatar — aucun nom réel, aucune photo, aucune adresse.",
          'Apprentissage : réponses aux exercices, progression, hifẓ, tracés des lettres, cartes de mots, jours de travail des ados et adultes.',
          "Enregistrements de la voix : ils restent sur l'appareil et s'effacent après 7 jours ; une famille peut choisir d'en envoyer un à l'enseignant de la classe (accord retirable, code parent pour un enfant) : chiffré, écouté par lui seul, jamais utilisé pour entraîner une intelligence artificielle.",
          "Espace école : prénom et initiale des élèves de classe papier, notes des bilans, récitations, devoirs ; nom complet saisi seulement au moment d'un certificat.",
          'Paiement : formule, statut et référence chez le prestataire ; jamais de numéro de carte.',
        ],
      },
      {
        titre: 'Finalités et bases légales',
        paras: [
          'Fournir le service demandé (exécution du contrat) ; accords spécifiques recueillis séparément, datés et retirables (consentement) : suivi par un enseignant, tuteur, hébergement en Europe pour le Sénégal ; sécurité et prévention des abus (intérêt légitime) ; obligations comptables (obligation légale).',
          'Aucune publicité, aucun profilage commercial, aucune revente de données, aucune personnalisation comportementale pour les enfants.',
        ],
      },
      {
        titre: 'Enfants : RGPD, COPPA, loi sénégalaise n° 2008-12',
        paras: [
          "RGPD (article 8) : le compte d'un enfant est toujours ouvert et géré par un parent, quel que soit l'âge du consentement numérique du pays (15 ans en France).",
          'États-Unis (COPPA) : pour un enfant de moins de 13 ans, le consentement du parent est recueilli avant toute collecte ; le parent peut consulter, exporter et faire supprimer les données de son enfant et retirer son accord à tout moment. [Méthode de vérification du consentement parental : à valider.]',
          "Sénégal : les traitements respectent la loi n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel ; [formalités auprès de la Commission de protection des données personnelles (CDP) : à accomplir]. L'hébergement hors du Sénégal (Union européenne) n'a lieu qu'avec l'accord explicite du titulaire.",
        ],
      },
      {
        titre: 'Destinataires et sous-traitants',
        paras: [
          "Hébergeur européen [à désigner] ; service d'envoi d'e-mails [à désigner] ; prestataires de paiement (Stripe, PayPal, agrégateur de mobile money) seulement si vous payez ; fournisseur d'intelligence artificielle (Anthropic) seulement si le tuteur est activé, sans nom ni adresse, avec un pseudonyme ; service de notification du navigateur (Google, Mozilla, Apple…) seulement si vous activez les notifications — leur contenu est chiffré et ne contient aucun nom. Aucune autre transmission.",
        ],
      },
      {
        titre: 'Durées de conservation',
        paras: [
          'Compte supprimé : effacement définitif sous 30 jours (sauvegardes chiffrées : 14 jours glissants).',
          'Journal du tuteur : 12 mois au plus. Enregistrements vocaux : 7 jours sur l’appareil ; récitation envoyée à l’enseignant : effacée après la durée réglée par la classe (14 jours par défaut, 30 au plus), ou dès que la famille la supprime.',
          "Registre des certificats de l'école : numéro, nom affiché, niveau, date et mention conservés durablement (preuve d'un diplôme) ; les autres données de l'élève suivent les durées ci-dessus et le document complet est réduit 30 jours après le départ de l'élève. [À confirmer par le juriste.]",
        ],
      },
      {
        titre: 'Vos droits',
        paras: [
          "Accès, rectification, effacement, portabilité (export complet depuis « Mon compte »), opposition, limitation, retrait d'un accord à tout moment. Réclamation possible auprès de la CNIL (France) ou de la CDP (Sénégal).",
        ],
      },
      {
        titre: 'Sécurité',
        paras: [
          "Connexion chiffrée, mots de passe protégés (argon2id), second facteur pour les enseignants et l'administration, cloisonnement des comptes de la base de données, sauvegardes chiffrées dont la clé est conservée hors du serveur, journal des actions sensibles.",
        ],
      },
    ],
  },
  cookies: {
    titre: 'Cookies et stockage sur l’appareil',
    maj: MAJ,
    sections: [
      {
        titre: 'Ce que nous utilisons',
        paras: [
          'Un seul cookie : « awform_session », qui garde votre connexion (strictement nécessaire, supprimé à la déconnexion ou à expiration).',
          "Stockage sur l'appareil (IndexedDB « awform » et cache de l'application) : leçons téléchargées, réponses en attente d'envoi, réglages et enregistrements vocaux — pour que l'application fonctionne sans réseau.",
        ],
      },
      {
        titre: 'Ce que nous n’utilisons pas',
        paras: [
          'Aucun cookie tiers, aucun traceur publicitaire, aucune mesure d’audience, aucun bouton de réseau social, aucune police ou ressource chargée depuis un autre site.',
        ],
      },
      {
        titre: 'Pourquoi aucune bannière de consentement',
        paras: [
          "Les cookies et le stockage strictement nécessaires au service que vous demandez sont exemptés de consentement (article 82 de la loi Informatique et Libertés ; lignes directrices de la CNIL). N'utilisant rien d'autre, l'application n'affiche pas de bannière. Si un traceur non nécessaire devait un jour être ajouté, une bannière (refuser aussi simple qu'accepter) serait obligatoire avant tout dépôt. [À confirmer par le juriste.]",
        ],
      },
    ],
  },
};

export interface FaqItem {
  q: string;
  r: string;
}

/** Aide : questions fréquentes (familles, adultes, enseignants). */
export const FAQ: Array<{ titre: string; items: FaqItem[] }> = [
  {
    titre: 'Commencer',
    items: [
      {
        q: 'Faut-il une adresse électronique pour mon enfant ?',
        r: "Non. Vous créez un compte parent, puis un profil pour chaque enfant (pseudonyme, année de naissance, niveau). L'enfant n'a ni e-mail ni mot de passe à retenir.",
      },
      {
        q: 'Par où commencer ?',
        r: "Ouvrez « Aujourd'hui » : la séance du jour vous propose le hifẓ, la leçon en cours et quelques mots à revoir, avec la durée prévue.",
      },
      {
        q: "L'application remplace-t-elle les livres ?",
        r: 'Non, elle les accompagne : mêmes leçons, mêmes exercices corrigés, mêmes carnets de hifẓ. Le QR code de chaque leçon ouvre la page correspondante.',
      },
    ],
  },
  {
    titre: 'Sans réseau',
    items: [
      {
        q: 'Peut-on travailler en mode avion ?',
        r: 'Oui. Téléchargez un niveau depuis « Téléchargements » ; les réponses partent seules au retour du réseau, sans rien perdre ni compter deux fois.',
      },
      {
        q: "L'application consomme-t-elle beaucoup de données ?",
        r: 'Un niveau entier pèse moins de 150 Ko ; le mode « données économes » limite encore les téléchargements.',
      },
    ],
  },
  {
    titre: 'Coran et hifẓ',
    items: [
      {
        q: "D'où vient le texte du Coran ?",
        r: 'Du texte de référence Tanzil (riwāya Ḥafṣ ʿan ʿĀṣim), comparé signe par signe à chaque import ; aucun programme ne l’écrit.',
      },
      {
        q: 'Qui valide une récitation ?',
        r: "L'enseignant, avec le barème des carnets (note sur 20). À la maison, le parent peut écouter avec son code parent.",
      },
    ],
  },
  {
    titre: 'École',
    items: [
      {
        q: 'Comment inscrire mon enfant dans la classe de son enseignant ?',
        r: "L'enseignant vous donne un code de classe ; dans « Profils », vous l'entrez pour votre enfant et donnez votre accord. Vous pouvez le retirer à tout moment.",
      },
      {
        q: 'Un certificat est-il une ijāza ?',
        r: "Non. Les certificats de niveau et les attestations de récitation constatent un parcours ou une récitation validée en classe ; ils ne sont ni une ijāza ni un diplôme d'État.",
      },
    ],
  },
  {
    titre: 'Compte et données',
    items: [
      {
        q: 'Comment exporter ou supprimer nos données ?',
        r: 'Dans « Mon compte » : export complet en un fichier, suppression du compte (effacement définitif sous 30 jours).',
      },
      {
        q: "J'ai oublié mon mot de passe.",
        r: "[Procédure de réinitialisation par e-mail : disponible à l'ouverture publique, avec le service d'e-mail.] En attendant, contactez l'école ou l'équipe AWFORM.",
      },
      {
        q: "L'application est indisponible, que faire ?",
        r: "Une page « service momentanément indisponible » s'affiche pendant une maintenance ; les leçons déjà téléchargées restent utilisables sans réseau.",
      },
    ],
  },
];
