/**
 * Schéma PostgreSQL initial (cahier des charges §5.5) — lot 1.
 * Contenu versionné par ÉDITION (import sans ressaisie), comptes minimisés (RGPD : pas de date de
 * naissance complète, pas de photo, pas d'adresse), apprentissage par ÉVÉNEMENTS immuables.
 * Texte stocké tel quel (UTF-8, JSONB) : aucune normalisation Unicode.
 * Les tables des lots suivants (classes, épreuves, messages, paiements, certificats, hifẓ détaillé)
 * seront ajoutées par de nouvelles migrations.
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ================================================================ contenu (par édition)

export const editionStatus = pgEnum('edition_status', ['brouillon', 'publiee', 'retiree']);

/** Photographie datée des fichiers des livres. */
export const edition = pgTable('edition', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  code: text('code').notNull().unique(),
  status: editionStatus('status').notNull().default('brouillon'),
  /** empreinte SHA-256 du manifeste de la copie source */
  sourceSha256: text('source_sha256').notNull(),
  /** rapport d'import : statistiques, avertissements */
  report: jsonb('report').notNull().default({}),
  notes: text('notes'),
  createdAt: createdAt(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

/** Niveau : en1, ad1… (identifiant définitif). */
export const level = pgTable('level', {
  code: text('code').primaryKey(),
  /** enfants | adultes | ados | religion… */
  track: text('track').notNull(),
  rank: smallint('rank').notNull(),
  titleFr: text('title_fr'),
  createdAt: createdAt(),
});

/** Métadonnées book.js d'un niveau, par édition. */
export const levelVersion = pgTable(
  'level_version',
  {
    editionId: uuid('edition_id')
      .notNull()
      .references(() => edition.id, { onDelete: 'cascade' }),
    levelCode: text('level_code')
      .notNull()
      .references(() => level.code),
    book: jsonb('book').notNull(),
  },
  (t) => [primaryKey({ columns: [t.editionId, t.levelCode] })],
);

export const unitKind = pgEnum('unit_kind', ['lecon', 'bilan', 'examen']);

/** Unité (leçon, bilan, examen) : id `<niveau>.l<NN>` = clé d'index-lecons.js (définitif). */
export const unit = pgTable(
  'unit',
  {
    id: text('id').primaryKey(),
    levelCode: text('level_code')
      .notNull()
      .references(() => level.code),
    /** rang du fichier (ordre du livre) */
    n: smallint('n').notNull(),
    kind: unitKind('kind').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('unit_level_n').on(t.levelCode, t.n)],
);

/** Unité × édition : JSON complet (source de vérité importée), projection élève, empreinte. */
export const unitVersion = pgTable(
  'unit_version',
  {
    editionId: uuid('edition_id')
      .notNull()
      .references(() => edition.id, { onDelete: 'cascade' }),
    unitId: text('unit_id')
      .notNull()
      .references(() => unit.id),
    /** numéro affiché « Leçon N » (peut changer d'une édition à l'autre) */
    numLecon: smallint('num_lecon'),
    /** numéro affiché « Bilan k » */
    numBilan: smallint('num_bilan'),
    titleAr: text('title_ar').notNull(),
    titleFr: text('title_fr').notNull(),
    sha256: text('sha256').notNull(),
    /** false si le fichier source n'était pas en JSON strict (lu dans le bac à sable) */
    strictJson: boolean('strict_json').notNull(),
    content: jsonb('content').notNull(),
    /** projection « élève — entraînement » (sans guide ni translittération) */
    student: jsonb('student').notNull(),
  },
  (t) => [primaryKey({ columns: [t.editionId, t.unitId] })],
);

/** Exercice : id de position `<unité>.ex<k>` (stable tant que l'ordre du livre ne change pas). */
export const exercise = pgTable(
  'exercise',
  {
    id: text('id').primaryKey(),
    unitId: text('unit_id')
      .notNull()
      .references(() => unit.id),
    position: smallint('position').notNull(),
    type: text('type').notNull(),
    graded: boolean('graded').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('exercise_unit_position').on(t.unitId, t.position)],
);

/** Exercice × édition, avec l'empreinte de son contenu (les réponses sont rattachées à cette empreinte). */
export const exerciseVersion = pgTable(
  'exercise_version',
  {
    editionId: uuid('edition_id')
      .notNull()
      .references(() => edition.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercise.id),
    hash: text('hash').notNull(),
    itemCount: smallint('item_count').notNull(),
    content: jsonb('content').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.editionId, t.exerciseId] }),
    index('exercise_version_hash').on(t.hash),
  ],
);

/** Carnets de hifẓ (data/hifz/<code>.js) par édition. */
export const hifzBook = pgTable(
  'hifz_book',
  {
    editionId: uuid('edition_id')
      .notNull()
      .references(() => edition.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    content: jsonb('content').notNull(),
  },
  (t) => [primaryKey({ columns: [t.editionId, t.code] })],
);

/** Texte coranique de référence : Tanzil quran-uthmani complet (6 236 versets), en lecture seule. */
export const quranVerse = pgTable(
  'quran_verse',
  {
    sura: smallint('sura').notNull(),
    aya: smallint('aya').notNull(),
    text: text('text').notNull(),
  },
  (t) => [primaryKey({ columns: [t.sura, t.aya] })],
);

export const registryKind = pgEnum('registry_kind', ['coran', 'hadith', 'fiqh', 'invocation']);

/** Registre canonique (registre/*.json) importé par édition ; statuts visibles de l'administration seulement. */
export const registryEntry = pgTable(
  'registry_entry',
  {
    editionId: uuid('edition_id')
      .notNull()
      .references(() => edition.id, { onDelete: 'cascade' }),
    kind: registryKind('kind').notNull(),
    id: text('id').notNull(),
    statut: text('statut'),
    /** jamais vrai sans validation par le référent humain (REGLES §2) */
    validationHumaine: boolean('validation_humaine').notNull().default(false),
    data: jsonb('data').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.editionId, t.kind, t.id] }),
    index('registry_statut').on(t.statut),
  ],
);

/** Illustrations (illus/*.js) par édition : SVG validé par liste blanche, personnages sans visage. */
export const illustration = pgTable(
  'illustration',
  {
    editionId: uuid('edition_id')
      .notNull()
      .references(() => edition.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    viewBox: text('view_box').notNull(),
    svg: text('svg').notNull(),
    sourceFile: text('source_file').notNull(),
  },
  (t) => [primaryKey({ columns: [t.editionId, t.key] })],
);

/** URL courte et éternelle des QR codes : /l/en1-05 → en1.l05. */
export const qrRedirect = pgTable('qr_redirect', {
  slug: text('slug').primaryKey(),
  unitId: text('unit_id')
    .notNull()
    .references(() => unit.id),
  createdAt: createdAt(),
});

// ================================================================ personnes (minimisation RGPD)

export const accountKind = pgEnum('account_kind', ['parent', 'adulte', 'admin', 'enseignant']);

/** Compte titulaire (parent/tuteur, adulte autonome, administrateur). */
export const account = pgTable(
  'account',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    kind: accountKind('kind').notNull(),
    /** e-mail en minuscules (V1 : ou téléphone) ; jamais d'autre donnée d'identité */
    email: text('email'),
    /** Argon2id (lot 4) ; null tant que le compte n'est pas activé */
    passwordHash: text('password_hash'),
    /** code pays ISO 3166-1 (prix, numéros d'aide, monnaie) */
    country: text('country'),
    locale: text('locale').notNull().default('fr'),
    /** secret TOTP chiffré (AES-256-GCM, clé serveur hors dépôt) */
    totpSecretEnc: text('totp_secret_enc'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    /** dernier pas de temps TOTP accepté (un code ne sert qu'une fois) */
    totpLastCounter: integer('totp_last_counter'),
    /** année de naissance du titulaire d'un compte adulte (âge du consentement numérique) */
    birthYear: smallint('birth_year'),
    /** code parent à 4 chiffres (Argon2id) : retour à l'espace parent sur un appareil partagé */
    parentPinHash: text('parent_pin_hash'),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    createdAt: createdAt(),
    /** suppression demandée : effacement définitif sous 30 jours */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('account_email').on(t.email)],
);

export const profileKind = pgEnum('profile_kind', ['enfant', 'ado', 'adulte']);

/** Profil d'apprenant : pseudonyme, ANNÉE de naissance seulement, avatar sans visage. */
export const profile = pgTable(
  'profile',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    kind: profileKind('kind').notNull(),
    pseudonym: text('pseudonym').notNull(),
    birthYear: smallint('birth_year'),
    /** clé d'un avatar SANS visage (bibliothèque de l'application) */
    avatar: text('avatar'),
    /** niveau courant, ex. en1 */
    levelCode: text('level_code').references(() => level.code),
    createdAt: createdAt(),
  },
  (t) => [
    index('profile_owner').on(t.ownerAccountId),
    check(
      'profile_birth_year',
      sql`${t.birthYear} IS NULL OR ${t.birthYear} BETWEEN 1900 AND 2100`,
    ),
  ],
);

/** Lien parent ↔ profil enfant/ado, avec consentement daté. */
export const guardianship = pgTable(
  'guardianship',
  {
    parentAccountId: uuid('parent_account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.parentAccountId, t.profileId] })],
);

/** Consentements (type, version du texte, date, retrait). */
export const consent = pgTable('consent', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  accountId: uuid('account_id')
    .notNull()
    .references(() => account.id, { onDelete: 'cascade' }),
  /** consentement donné POUR un profil d'enfant (sinon : pour le compte) */
  profileId: uuid('profile_id').references(() => profile.id, { onDelete: 'cascade' }),
  /** pays du compte au moment du consentement (règles : RGPD, COPPA, loi sénégalaise 2008-12) */
  country: text('country'),
  /** comment le consentement parental a été vérifié (ex. ré-authentification + déclaration) */
  evidence: jsonb('evidence'),
  type: text('type').notNull(),
  textVersion: text('text_version').notNull(),
  givenAt: timestamp('given_at', { withTimezone: true }).notNull().defaultNow(),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
});

/** Sessions : seul le HACHÉ du jeton est stocké. */
export const session = pgTable(
  'session',
  {
    tokenHash: text('token_hash').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** second facteur vérifié pour cette session (enseignant, administrateur) */
    mfaVerified: boolean('mfa_verified').notNull().default(false),
  },
  (t) => [index('session_account').on(t.accountId)],
);

/** Limitation des essais (connexion, code parent) : verrouillage progressif, partagé entre instances. */
export const authThrottle = pgTable('auth_throttle', {
  key: text('key').primaryKey(),
  failures: integer('failures').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ================================================================ apprentissage

/**
 * Journal IMMUABLE des tentatives et actions d'apprentissage (hors ligne d'abord) : identifiant UUIDv7
 * généré sur l'appareil → le serveur ignore un doublon (idempotence). Rattaché à l'édition et à
 * l'empreinte de l'exercice au moment de la réponse.
 */
export const attempt = pgTable(
  'attempt',
  {
    id: uuid('id').primaryKey(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    editionId: uuid('edition_id')
      .notNull()
      .references(() => edition.id),
    unitId: text('unit_id')
      .notNull()
      .references(() => unit.id),
    exerciseId: text('exercise_id').references(() => exercise.id),
    exerciseHash: text('exercise_hash'),
    /** item concerné (null = exercice entier) */
    itemIndex: smallint('item_index'),
    /** exercise_answer, checklist, dictee… */
    eventType: text('event_type').notNull(),
    response: jsonb('response'),
    correct: integer('correct'),
    total: integer('total'),
    score: real('score'),
    /** mode entraînement : numéro d'essai (1 = premier essai) */
    tryNumber: smallint('try_number'),
    deviceAt: timestamp('device_at', { withTimezone: true }).notNull(),
    serverAt: timestamp('server_at', { withTimezone: true }).notNull().defaultNow(),
    deviceId: text('device_id'),
  },
  (t) => [
    index('attempt_profile_unit').on(t.profileId, t.unitId),
    index('attempt_exercise').on(t.exerciseId, t.exerciseHash),
  ],
);

export const progressStatus = pgEnum('progress_status', [
  'ouverte',
  'commencee',
  'terminee',
  'maitrisee',
]);

/** État RECALCULÉ à partir des tentatives (profil × unité). */
export const progress = pgTable(
  'progress',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    unitId: text('unit_id')
      .notNull()
      .references(() => unit.id),
    status: progressStatus('status').notNull(),
    /** moyenne des exercices notés faits (0 à 1) */
    score: real('score'),
    bestScore: real('best_score'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.unitId] })],
);

// ================================================================ hifẓ (lot 5)

export const hifzMode = pgEnum('hifz_mode', ['carnet', 'rythme']);

/**
 * Plan de mémorisation d'un profil : carnet du niveau (E1, N1…) ou parcours complet à un rythme de 3 à
 * 7 ans (mois d'essai d'abord). Un seul plan actif par profil ; changer de rythme ne perd rien.
 */
export const hifzPlan = pgTable(
  'hifz_plan',
  {
    profileId: uuid('profile_id')
      .primaryKey()
      .references(() => profile.id, { onDelete: 'cascade' }),
    mode: hifzMode('mode').notNull(),
    /** carnet : code du niveau (en1, ad1) */
    bookCode: text('book_code'),
    /** rythme : 3 à 7 ans */
    rhythmYears: smallint('rhythm_years'),
    /**
     * cycle de la roue pour tout l'acquis (30, 45 ou 60 jours), réglé par l'enseignant ; null : défaut
     * (30 pour 3 et 4 ans, 45 pour 5 à 7 ans)
     */
    cycleDays: smallint('cycle_days'),
    /** ordre des sourates (rythme) : rebours | juz30 */
    suraOrder: text('sura_order').notNull().default('rebours'),
    /** premier jour du plan (AAAA-MM-JJ, fuseau de l'élève) */
    startDate: text('start_date').notNull(),
    /** mois d'essai au rythme « 7 ans » avant la proposition de rythme */
    trial: boolean('trial').notNull().default(false),
    /** allègement accepté par l'enseignant ou l'adulte : nouveau × facteur jusqu'à la date */
    newFactor: real('new_factor').notNull().default(1),
    reliefUntil: text('relief_until'),
    updatedBy: uuid('updated_by').references(() => account.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('hifz_plan_rhythm', sql`${t.rhythmYears} IS NULL OR ${t.rhythmYears} BETWEEN 3 AND 7`),
  ],
);

/**
 * Journal IMMUABLE du hifẓ : portion apprise, révision (auto-évaluation, parent, enseignant), avec la
 * source (le poids du résultat en dépend) ; les états (étapes, solidité, roue) sont recalculés.
 */
export const hifzEvent = pgTable(
  'hifz_event',
  {
    id: uuid('id').primaryKey(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    /** jour de l'élève (AAAA-MM-JJ) */
    day: text('day').notNull(),
    /** clé de la part : « 112:1-4 » (carnet) ou « q12 » (parcours complet) */
    part: text('part').notNull(),
    kind: text('kind').notNull(),
    q: smallint('q'),
    source: text('source').notNull(),
    /** parcours complet : position atteinte dans la séquence */
    pos: integer('pos'),
    /** relevés du maître, note /20, mention ; versets de la portion */
    details: jsonb('details'),
    authorAccountId: uuid('author_account_id').references(() => account.id, {
      onDelete: 'set null',
    }),
    deviceAt: timestamp('device_at', { withTimezone: true }).notNull(),
    serverAt: timestamp('server_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('hifz_event_profile').on(t.profileId, t.day),
    check('hifz_event_q', sql`${t.q} IS NULL OR ${t.q} BETWEEN 0 AND 3`),
  ],
);

/** Classe d'un enseignant (lot 5 : suivi du hifẓ ; l'espace enseignant complet vient au lot S2). */
export const classGroup = pgTable('class_group', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  teacherAccountId: uuid('teacher_account_id')
    .notNull()
    .references(() => account.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** code à donner aux familles (8 caractères) : le PARENT inscrit lui-même son enfant */
  joinCode: text('join_code').notNull().unique(),
  createdAt: createdAt(),
});

/** Élève d'une classe : ajouté par le parent (consentement « partage_enseignant »), retirable. */
export const classMember = pgTable(
  'class_member',
  {
    classId: uuid('class_id')
      .notNull()
      .references(() => classGroup.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    addedBy: uuid('added_by').references(() => account.id, { onDelete: 'set null' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.classId, t.profileId] }),
    index('class_member_profile').on(t.profileId),
  ],
);

// ================================================================ traçabilité

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorAccountId: uuid('actor_account_id').references(() => account.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    target: text('target'),
    before: jsonb('before'),
    after: jsonb('after'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_at').on(t.at)],
);
