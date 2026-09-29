/**
 * English version of the legal pages and help (lot 15) — DRAFT TRANSLATION, TO BE REVIEWED BY A NATIVE
 * SPEAKER, and like the French original, TO BE VALIDATED BY A LAWYER. Shown only when English (a language
 * « in preparation ») is enabled on the server (AWFORM_LANGUES_PREPARATION).
 */
import type { FaqItem, LegalKey, LegalPage } from './content';

const UPDATED = '29 September 2026 (draft)';

export const LEGAL_EN: Record<LegalKey, LegalPage> = {
  mentions: {
    titre: 'Legal notice',
    maj: UPDATED,
    sections: [
      {
        titre: 'Publisher',
        paras: [
          'AWFORM (proposed trade name: Awzid) — [company name, legal form, share capital: to be completed].',
          'Registered office: [address to be completed]. Registration: [RCS / SIREN or NINEA: to be completed].',
          'Publication director: [name to be completed].',
          'Contact: [contact email address to be created].',
        ],
      },
      {
        titre: 'Hosting',
        paras: [
          'Host: [European hosting provider to be appointed — name, address, telephone]. Data is hosted in the European Union.',
        ],
      },
      {
        titre: 'Intellectual property',
        paras: [
          'AWFORM books, lessons, illustrations, exercises and texts are protected; any reproduction beyond the personal or school use allowed by the terms of use is forbidden without written permission.',
          'Quranic text: Tanzil (tanzil.net), riwāya Ḥafṣ ʿan ʿĀṣim, reproduced exactly, without any change. Quran metadata (ajzāʾ, aḥzāb, pages of the Madinah Muṣḥaf): Tanzil.info, Creative Commons Attribution 3.0 licence.',
        ],
      },
    ],
  },
  cgu: {
    titre: 'Terms of use',
    maj: UPDATED,
    sections: [
      {
        titre: 'Purpose',
        paras: [
          'AWFORM is an app for learning Arabic, memorising the Quran (hifẓ) and basic religious education, alongside the AWFORM books. These terms govern its use.',
        ],
      },
      {
        titre: 'Accounts',
        paras: [
          'Parent account: for adults only; the parent creates their children’s profiles (nickname, year of birth, level) and gives the necessary agreements. A child never has an email address or an account in their own name.',
          'Adult account: for an adult learner. A minor cannot open an adult account on their own.',
          'Teacher account: opened by the school and protected by a second factor. Teachers only see the pupils enrolled in their class by a parent (class code and agreement) or entered by the school (paper class).',
          'Everyone keeps their password secret; the parent code protects settings and purchases.',
        ],
      },
      {
        titre: 'Religious content and tutor',
        paras: [
          'The Quranic text shown comes only from the Tanzil reference text; no program writes or edits it. Hadiths are shown only when marked “verified” in the books’ register.',
          'The tutor is a computer program: it says so, gives no religious rulings and passes religious questions to the teacher. It is off by default for children and only turns on with the parent’s agreement; the parent can read everything it said.',
          'Certificates and attestations issued by a school are neither an ijāza nor a state diploma.',
        ],
      },
      {
        titre: 'Plans, payment, cancellation',
        paras: [
          'A free plan lets you try the first lessons. Paid plans, their prices and duration are shown before purchase; only the adult can buy (parent code). No card details go through AWFORM: payment is made with the chosen provider.',
          'A subscription can be stopped at any time; rights last until the end of the paid period. [Right of withdrawal and refunds: to be completed according to the country and the provider.]',
        ],
      },
      {
        titre: 'Liability and suspension',
        paras: [
          'The app is provided with care but without any guarantee of uninterrupted service. An account may be suspended for use contrary to these terms or to the law, after informing its holder except in an emergency.',
        ],
      },
      {
        titre: 'Governing law',
        paras: [
          '[Governing law and competent courts: to be completed by the lawyer — France or Senegal depending on the client’s country.]',
        ],
      },
    ],
  },
  confidentialite: {
    titre: 'Privacy policy',
    maj: UPDATED,
    sections: [
      {
        titre: 'Data controller',
        paras: [
          '[Company name and address: to be completed]. Contact about your data: [email address to be created]. Data protection officer: [to be appointed if required].',
          'For a school using the school space (paper class, results, certificates), the school is the controller of the data it enters; AWFORM acts on its behalf (processor). [Data processing agreement to be drawn up.]',
        ],
      },
      {
        titre: 'Data collected (only what is necessary)',
        paras: [
          'Account: the adult’s email address and password (protected, never readable); country; language.',
          'Child profile: nickname, year of birth (never the full date), level, avatar — no real name, no photo, no address.',
          'Learning: exercise answers, progress, hifẓ, letter tracings, word cards, work days for teens and adults.',
          'Voice recordings: they stay on the device and are erased after 7 days; a family can choose to send one to the class teacher (revocable agreement, parent code for a child): encrypted, listened to by the teacher only, never used to train an artificial intelligence.',
          'School space: first name and initial of paper-class pupils, marks, recitations, homework; the full name is entered only when a certificate is issued.',
          'Payment: plan, status and provider reference; never a card number.',
        ],
      },
      {
        titre: 'Purposes and legal bases',
        paras: [
          'Providing the service you ask for (performance of the contract); specific agreements collected separately, dated and revocable (consent): follow-up by a teacher, tutor, hosting in Europe for Senegal; security and abuse prevention (legitimate interest); accounting obligations (legal obligation).',
          'No advertising, no commercial profiling, no sale of data, no behaviour-based personalisation for children.',
        ],
      },
      {
        titre: 'Children: GDPR, COPPA, Senegalese law no. 2008-12',
        paras: [
          'GDPR (article 8): a child’s account is always opened and managed by a parent, whatever the age of digital consent in the country (15 in France).',
          'United States (COPPA): for a child under 13, the parent’s consent is obtained before any collection; the parent can view, export and have their child’s data deleted, and withdraw their agreement at any time. [Method for verifying parental consent: to be validated.]',
          'Senegal: processing complies with law no. 2008-12 of 25 January 2008 on the protection of personal data; [formalities with the Personal Data Protection Commission (CDP): to be completed]. Hosting outside Senegal (European Union) only takes place with the holder’s explicit agreement.',
        ],
      },
      {
        titre: 'Recipients and processors',
        paras: [
          'European hosting provider [to be appointed]; email service [to be appointed]; payment providers (Stripe, PayPal, mobile-money aggregator) only if you pay; artificial-intelligence provider (Anthropic) only if the tutor is turned on, with no name or address, under a pseudonym; the browser’s notification service (Google, Mozilla, Apple…) only if you turn notifications on — their content is encrypted and contains no names. No other transfer.',
        ],
      },
      {
        titre: 'Retention periods',
        paras: [
          'Deleted account: permanently erased within 30 days (encrypted backups: rolling 14 days).',
          'Tutor log: 12 months at most. Voice recordings: 7 days on the device; a recitation sent to the teacher: erased after the period set by the class (14 days by default, 30 at most), or as soon as the family deletes it.',
          'School certificate register: number, displayed name, level, date and grade kept permanently (proof of a diploma); the pupil’s other data follows the periods above and the full document is reduced 30 days after the pupil leaves. [To be confirmed by the lawyer.]',
        ],
      },
      {
        titre: 'Your rights',
        paras: [
          'Access, rectification, erasure, portability (full export from “My account”), objection, restriction, withdrawal of an agreement at any time. You may complain to the CNIL (France) or the CDP (Senegal).',
        ],
      },
      {
        titre: 'Security',
        paras: [
          'Encrypted connection, protected passwords (argon2id), second factor for teachers and administrators, separate database accounts, encrypted backups whose key is kept off the server, log of sensitive actions.',
        ],
      },
    ],
  },
  cookies: {
    titre: 'Cookies and on-device storage',
    maj: UPDATED,
    sections: [
      {
        titre: 'What we use',
        paras: [
          'A single cookie: “awform_session”, which keeps you signed in (strictly necessary, removed when you sign out or when it expires).',
          'On-device storage (IndexedDB “awform” and the app cache): downloaded lessons, answers waiting to be sent, settings and voice recordings — so that the app works without a network.',
        ],
      },
      {
        titre: 'What we do not use',
        paras: [
          'No third-party cookies, no advertising trackers, no audience measurement, no social-media buttons, no font or resource loaded from another site.',
        ],
      },
      {
        titre: 'Why there is no consent banner',
        paras: [
          'Cookies and storage strictly necessary for the service you ask for are exempt from consent (article 82 of the French Data Protection Act; CNIL guidelines). As nothing else is used, the app shows no banner. If a non-essential tracker were ever added, a banner (refusing as easy as accepting) would be required before anything is stored. [To be confirmed by the lawyer.]',
        ],
      },
    ],
  },
};

export const FAQ_EN: Array<{ titre: string; items: FaqItem[] }> = [
  {
    titre: 'Getting started',
    items: [
      {
        q: 'Does my child need an email address?',
        r: 'No. You create a parent account, then a profile for each child (nickname, year of birth, level). Your child has no email and no password to remember.',
      },
      {
        q: 'Where do I start?',
        r: 'Open “Today”: the day’s session offers hifẓ, the current lesson and a few words to review, with the expected duration.',
      },
      {
        q: 'Does the app replace the books?',
        r: 'No, it goes with them: same lessons, same corrected exercises, same hifẓ notebooks. Each lesson’s QR code opens the matching page.',
      },
    ],
  },
  {
    titre: 'Without a network',
    items: [
      {
        q: 'Can we work in airplane mode?',
        r: 'Yes. Download a level from “Downloads”; answers are sent automatically when the network is back, with nothing lost or counted twice.',
      },
      {
        q: 'Does the app use a lot of data?',
        r: 'A whole level weighs less than 150 kB; “data saver” mode limits downloads even further.',
      },
    ],
  },
  {
    titre: 'Quran and hifẓ',
    items: [
      {
        q: 'Where does the Quran text come from?',
        r: 'From the Tanzil reference text (riwāya Ḥafṣ ʿan ʿĀṣim), checked sign by sign at every import; no program writes it.',
      },
      {
        q: 'Who validates a recitation?',
        r: 'The teacher, using the notebooks’ marking scale (a mark out of 20). At home, the parent can listen with their parent code.',
      },
    ],
  },
  {
    titre: 'School',
    items: [
      {
        q: 'How do I enrol my child in their teacher’s class?',
        r: 'The teacher gives you a class code; in “Profiles”, enter it for your child and give your agreement. You can withdraw it at any time.',
      },
      {
        q: 'Is a certificate an ijāza?',
        r: 'No. Level certificates and recitation attestations record a course or a recitation validated in class; they are neither an ijāza nor a state diploma.',
      },
    ],
  },
  {
    titre: 'Account and data',
    items: [
      {
        q: 'How do we export or delete our data?',
        r: 'In “My account”: a full export in one file, and account deletion (permanent erasure within 30 days).',
      },
      {
        q: 'I forgot my password.',
        r: '[Reset by email: available at public launch, with the email service.] Meanwhile, contact the school or the AWFORM team.',
      },
      {
        q: 'The app is unavailable — what should I do?',
        r: 'A “service temporarily unavailable” page is shown during maintenance; lessons already downloaded keep working offline.',
      },
    ],
  },
];
