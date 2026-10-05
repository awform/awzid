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
  bigint,
  bigserial,
  customType,
  boolean,
  check,
  date,
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
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** octets bruts (audio chiffré) */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Écoles juridiques admises (lot F1, G2 ; même liste que `MADHHABS` de @awform/content). */
const MADHHAB_SQL = "'maliki', 'hanafi', 'shafii', 'hanbali', 'commun'";

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
  /** langue SOURCE des textes des livres (lot F1, G1) : français (décision du client) */
  sourceLocale: text('source_locale').notNull().default('fr'),
  createdAt: createdAt(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

/** Niveau : en1, ad1… (identifiant définitif). */
export const level = pgTable(
  'level',
  {
    code: text('code').primaryKey(),
    /** enfants | adultes | ados | religion… */
    track: text('track').notNull(),
    rank: smallint('rank').notNull(),
    titleFr: text('title_fr'),
    /**
     * École juridique (lot F1, G2) : « maliki » pour les sciences islamiques, « commun » pour l'arabe et le Coran
     * (null : non étiqueté). Étiquette seulement, aucun texte modifié.
     */
    madhhab: text('madhhab'),
    /** matière (lot F2, revue E8) : arabe (en, ado, ad), sciences (re, ra), coran (qc) */
    subjectCode: text('subject_code').references(() => subject.code),
    createdAt: createdAt(),
  },
  (t) => [
    check('level_madhhab', sql`${t.madhhab} IS NULL OR ${t.madhhab} IN (${sql.raw(MADHHAB_SQL)})`),
  ],
);

/**
 * Matière (lot F2, revue E8) : l'élève a un niveau courant PAR matière (`profile_level`). « ecriture » n'a pas
 * encore de niveaux (entraînement du tracé). Liste fermée, posée par la migration 0036.
 */
export const subject = pgTable('subject', {
  code: text('code').primaryKey(),
  titleFr: text('title_fr').notNull(),
  rank: smallint('rank').notNull(),
  /** la matière a des niveaux (livres) ; sinon parcours libre */
  hasLevels: boolean('has_levels').notNull().default(true),
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
    /**
     * Blocs de fiqh → école (lot F1, G2) : `{ "fiqh_adab": "maliki", "rubriques.3": "maliki" }` ; `{}` sans bloc de
     * fiqh ; null : pas encore calculé (rempli par `backfillContent`). Le texte du livre n'est pas touché.
     */
    madhhabBlocks: jsonb('madhhab_blocks'),
  },
  (t) => [primaryKey({ columns: [t.editionId, t.unitId] })],
);

/**
 * Exercice : identifiant GELÉ des livres (`id` explicite, ex. `ad2.l03.ex4` — jamais recalculé depuis la
 * position, lot F1). `position` = rang dans la DERNIÈRE édition importée (le rang par édition est dans
 * `exercise_version.position`) : un exercice inséré ne décale plus l'identité des autres.
 */
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
  (t) => [index('exercise_unit').on(t.unitId, t.position)],
);

/**
 * Exercice × édition. Deux empreintes (lot F1, E5) : `hash` = TEXTE complet (sert à reconnaître la version
 * qu'un appareil avait téléchargée), `answer_hash` = CORRIGÉ seul (réponses attendues : seule sa modification
 * invalide les réponses données). `position` : rang dans le livre de CETTE édition.
 */
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
    /** null : pas encore calculé (rempli par `backfillContent` après la migration) */
    answerHash: text('answer_hash'),
    position: smallint('position').notNull(),
    itemCount: smallint('item_count').notNull(),
    content: jsonb('content').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.editionId, t.exerciseId] }),
    index('exercise_version_hash').on(t.hash),
  ],
);

/**
 * Lignée des exercices (lot F1, E5 ; CDC §5.2) : ancien identifiant → identifiant actuel, remplie par l'import
 * (tables de gel quand l'identifiant a changé, `ids/lignee.json` des livres). Les réponses données sous
 * l'ancien identifiant suivent la lignée ; elles ne comptent que si le corrigé est resté le même.
 */
export const exerciseLineage = pgTable(
  'exercise_lineage',
  {
    fromId: text('from_id').notNull(),
    /** null : exercice retiré */
    toId: text('to_id'),
    kind: text('kind').notNull(),
    note: text('note'),
    /** édition dont l'import a déclaré cette lignée */
    editionId: uuid('edition_id').references(() => edition.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('exercise_lineage_from_to').on(t.fromId, t.toId).nullsNotDistinct(),
    check(
      'exercise_lineage_kind',
      sql`${t.kind} IN ('gel', 'remplace', 'fusion', 'scission', 'retire') AND (${t.kind} = 'retire') = (${t.toId} IS NULL)`,
    ),
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

/** Livrets de lecture graduée (data/lect) par édition : projection élève + fiche du catalogue. */
export const booklet = pgTable(
  'booklet',
  {
    editionId: uuid('edition_id')
      .notNull()
      .references(() => edition.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    levelCode: text('level_code').notNull(),
    /** rang dans le catalogue (ordre de la bibliothèque) */
    rank: smallint('rank').notNull(),
    catalogue: jsonb('catalogue').notNull(),
    content: jsonb('content').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.editionId, t.code] }),
    index('booklet_level').on(t.editionId, t.levelCode),
  ],
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

/**
 * Divisions officielles du Coran (métadonnées Tanzil, CC BY 3.0) : début de chaque juzʾ, quart de ḥizb,
 * page du Muṣḥaf de Médine et manzil. Table de référence en lecture seule, comme quran_verse.
 */
export const quranDivision = pgTable(
  'quran_division',
  {
    kind: text('kind').notNull(),
    n: smallint('n').notNull(),
    sura: smallint('sura').notNull(),
    aya: smallint('aya').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.kind, t.n] }),
    check('quran_division_kind', sql`${t.kind} IN ('juz', 'quart', 'page', 'manzil')`),
  ],
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
    /** école (lot F1, G2) : « maliki » pour les règles de fiqh, « commun » pour versets et hadiths */
    madhhab: text('madhhab'),
    data: jsonb('data').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.editionId, t.kind, t.id] }),
    index('registry_statut').on(t.statut),
    check(
      'registry_madhhab',
      sql`${t.madhhab} IS NULL OR ${t.madhhab} IN (${sql.raw(MADHHAB_SQL)})`,
    ),
  ],
);

/**
 * Traductions des CONTENUS (lot F1, revue G1) — structure prête, VIDE (les livres restent en français) :
 * calque « texte source + traduction versionnée ». Le texte source est le champ français du livre
 * (`object_kind` + `object_id` + `field_path`), repéré par son empreinte : une traduction faite sur un texte
 * source qui a changé n'est plus servie. Une traduction RELIGIEUSE (sens d'un verset, hadith, invocation,
 * fiqh, extraits de l'école) n'est servie que validée par le référent ; une autre, relue ou validée.
 */
export const contentTranslation = pgTable(
  'content_translation',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    /** unite | exercice | registre | niveau | livret */
    objectKind: text('object_kind').notNull(),
    objectId: text('object_id').notNull(),
    /** chemin du champ dans le JSON source, ex. `rubriques.2.texte.0.fr` */
    fieldPath: text('field_path').notNull(),
    locale: text('locale').notNull(),
    version: smallint('version').notNull().default(1),
    /** SHA-256 du texte source (français) traduit */
    sourceSha256: text('source_sha256').notNull(),
    sourceEditionId: uuid('source_edition_id').references(() => edition.id, {
      onDelete: 'set null',
    }),
    text: text('text').notNull(),
    religious: boolean('religious').notNull(),
    status: text('status').notNull().default('brouillon'),
    translatorAccountId: uuid('translator_account_id').references(() => account.id, {
      onDelete: 'set null',
    }),
    reviewedBy: uuid('reviewed_by').references(() => account.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** référent qui a validé (exigé pour le statut « validee ») */
    validatedBy: uuid('validated_by').references(() => account.id, { onDelete: 'set null' }),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('content_translation_version').on(
      t.objectKind,
      t.objectId,
      t.fieldPath,
      t.locale,
      t.version,
    ),
    check(
      'content_translation_kind',
      sql`${t.objectKind} IN ('unite', 'exercice', 'registre', 'niveau', 'livret')`,
    ),
    check(
      'content_translation_status',
      sql`${t.status} IN ('brouillon', 'relue', 'validee', 'rejetee')`,
    ),
    check(
      'content_translation_locale',
      sql`${t.locale} ~ '^[a-z]{2,3}(-[A-Z]{2})?$' AND ${t.locale} <> 'fr'`,
    ),
    check(
      'content_translation_validee',
      sql`${t.status} <> 'validee' OR ${t.validatedAt} IS NOT NULL`,
    ),
    check('content_translation_text', sql`char_length(${t.text}) <= 20000`),
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

/**
 * Type de compte = ce que le TITULAIRE est (lot F2, revue E2) : famille (parent), adulte autonome, ÉCOLE (compte
 * technique, sans e-mail ni mot de passe, titulaire des profils inscrits par l'école), ou compte de personnel
 * seul (enseignant, admin : comptes existants). Les RÔLES (enseignant, direction, référent…) sont portés à part
 * (`account_role`, `school_member`) : un même e-mail peut être parent ET enseignant.
 * Texte contrôlé (ancien type énuméré `account_kind`, converti par la migration 0034).
 */
export const ACCOUNT_KINDS = ['parent', 'adulte', 'admin', 'enseignant', 'ecole'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/** Compte titulaire (parent/tuteur, adulte autonome, école, personnel). */
export const account = pgTable(
  'account',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    kind: text('kind', { enum: ACCOUNT_KINDS }).notNull(),
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
    /** audit SEC-1 : nouveau secret EN ATTENTE ; il ne remplace l'actuel qu'à la confirmation */
    totpPendingEnc: text('totp_pending_enc'),
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
  (t) => [
    uniqueIndex('account_email').on(t.email),
    check(
      'account_kind_check',
      sql`${t.kind} IN ('parent', 'adulte', 'admin', 'enseignant', 'ecole')`,
    ),
  ],
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
    /**
     * niveau d'ARABE courant, ex. en1 — copie de compatibilité : la référence est `profile_level` (un niveau
     * par matière, historisé ; lot F2). Tenue à jour par `setProfileLevel`.
     */
    levelCode: text('level_code').references(() => level.code),
    /**
     * Langue des EXPLICATIONS du contenu (lot F1, G1), distincte de la langue de l'interface
     * (`account.locale`) ; « fr » tant qu'aucune traduction validée n'existe (les livres restent en français).
     */
    explanationLocale: text('explanation_locale').notNull().default('fr'),
    createdAt: createdAt(),
  },
  (t) => [
    index('profile_owner').on(t.ownerAccountId),
    check(
      'profile_birth_year',
      sql`${t.birthYear} IS NULL OR ${t.birthYear} BETWEEN 1900 AND 2100`,
    ),
    check('profile_explanation_locale', sql`${t.explanationLocale} ~ '^[a-z]{2,3}(-[A-Z]{2})?$'`),
  ],
);

/**
 * Lien parent ↔ profil enfant/ado, avec consentement daté (lots 1-4). Lot F2 : REMPLACÉE par `profile_custodian`
 * (toutes les lignes y sont reprises par la migration 0035) ; gardée telle quelle, en lecture seule, pour le
 * retour arrière. Plus aucune écriture.
 */
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

/**
 * Responsables d'un profil (lot F2, revue E3/E4), LUS par toutes les autorisations (`ownsProfile`) :
 *  - « parent » : un compte parent (premier, second parent ; invitation par code puis acceptation) ;
 *  - « ecole » : l'école qui a inscrit l'élève, avec la PREUVE du consentement recueilli sur papier.
 * Le titulaire (`profile.owner_account_id`) reste unique : parent, compte école, ou le jeune lui-même après
 * l'émancipation. Une ligne « invite » porte le haché d'un code à usage unique (jamais le code).
 */
export const profileCustodian = pgTable(
  'profile_custodian',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    nature: text('nature').notNull(),
    accountId: uuid('account_id').references(() => account.id, { onDelete: 'cascade' }),
    schoolId: uuid('school_id').references(() => school.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('actif'),
    /** invitation : SHA-256 du code (rattachement à un parent, second parent, émancipation) */
    codeHash: text('code_hash'),
    codeExpiresAt: timestamp('code_expires_at', { withTimezone: true }),
    /** preuve du consentement (papier : date, signataire, référence du formulaire ; en ligne : méthode) */
    evidence: jsonb('evidence'),
    createdBy: uuid('created_by').references(() => account.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: text('end_reason'),
  },
  (t) => [
    index('profile_custodian_profile').on(t.profileId),
    index('profile_custodian_account').on(t.accountId),
    uniqueIndex('profile_custodian_code').on(t.codeHash),
    uniqueIndex('profile_custodian_parent_actif')
      .on(t.profileId, t.accountId)
      .where(sql`${t.status} = 'actif' AND ${t.nature} = 'parent'`),
    uniqueIndex('profile_custodian_ecole_actif')
      .on(t.profileId, t.schoolId)
      .where(sql`${t.status} = 'actif' AND ${t.nature} = 'ecole'`),
    check('profile_custodian_nature', sql`${t.nature} IN ('parent', 'ecole', 'emancipation')`),
    check('profile_custodian_status', sql`${t.status} IN ('invite', 'actif', 'termine')`),
    check(
      'profile_custodian_cible',
      sql`(${t.nature} = 'ecole' AND ${t.schoolId} IS NOT NULL) OR (${t.nature} <> 'ecole' AND (${t.accountId} IS NOT NULL OR ${t.status} = 'invite' OR ${t.status} = 'termine'))`,
    ),
  ],
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
    /**
     * Mode TABLETTE DE CLASSE (lot F2, revue E3) : session du compte de l'école, ouverte par un enseignant,
     * limitée aux élèves de CETTE classe (profils de l'école ou inscrits par leur parent).
     */
    tabletClassId: uuid('tablet_class_id').references(() => classGroup.id, {
      onDelete: 'cascade',
    }),
    tabletOpenedBy: uuid('tablet_opened_by').references(() => account.id, {
      onDelete: 'set null',
    }),
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
    /** empreinte du TEXTE de l'exercice tel que l'appareil l'avait (édition de l'événement) */
    exerciseHash: text('exercise_hash'),
    /** empreinte du CORRIGÉ au moment de la réponse (lot F1) : la réponse compte tant qu'il n'a pas changé */
    answerHash: text('answer_hash'),
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

/**
 * Classe (lot 5) — lot F2 (revue E1) : la classe appartient à une ÉCOLE (`school_id`), ses enseignants sont dans
 * `class_teacher` (titulaire, suppléants). `teacher_account_id` = titulaire actuel (copie tenue par
 * `setClassTitular`), clé en RESTRICT : la suppression d'un compte d'enseignant passe d'abord par le transfert
 * de ses classes (`releaseTeacher`) ; plus jamais d'effacement en cascade des classes, notes et épreuves.
 */
export const classGroup = pgTable(
  'class_group',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    teacherAccountId: uuid('teacher_account_id').references(() => account.id, {
      onDelete: 'restrict',
    }),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id, { onDelete: 'restrict' }),
    schoolYearId: uuid('school_year_id').references(() => schoolYear.id, { onDelete: 'restrict' }),
    /** matière suivie (arabe, sciences, coran…), déduite du niveau ; « coran » pour un cercle */
    subjectCode: text('subject_code').references(() => subject.code),
    /** classe (un niveau) ou cercle de Coran (ḥalaqa, par portion) */
    kind: text('kind').notNull().default('classe'),
    /** cercle : portion suivie (ex. « juz30 », « 67-77 ») */
    portion: text('portion'),
    /** active ; archivée à la clôture de l'année (lecture seule, registre conservé) */
    status: text('status').notNull().default('active'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    name: text('name').notNull(),
    /** code à donner aux familles (8 caractères) : le PARENT inscrit lui-même son enfant */
    joinCode: text('join_code').notNull().unique(),
    /** espace école (lot 13) : niveau suivi, établissement et lieu (certificats), année scolaire */
    levelCode: text('level_code'),
    schoolName: text('school_name'),
    schoolNameAr: text('school_name_ar'),
    place: text('place'),
    placeAr: text('place_ar'),
    schoolYear: text('school_year'),
    /** récitations envoyées : durée de conservation (jours, 1 à 30), réglée par l'enseignant (lot 16) */
    recitationDays: smallint('recitation_days').notNull().default(14),
    createdAt: createdAt(),
  },
  (t) => [
    index('class_group_school').on(t.schoolId, t.schoolYearId),
    check('class_group_kind', sql`${t.kind} IN ('classe', 'cercle')`),
    check('class_group_status', sql`${t.status} IN ('active', 'archivee')`),
  ],
);

// ================================================================ école, rôles, niveaux (lot F2, revue E1/E2/E8)

/**
 * École (revue E1) : établissement physique, école en ligne, ou école « personnelle » créée automatiquement pour
 * un enseignant indépendant (reprise des classes existantes). Porte la licence (`subscription.school_id`) et,
 * une fois créé, le compte technique titulaire des profils qu'elle inscrit (`account_id`, type « ecole »).
 */
export const school = pgTable(
  'school',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    country: text('country'),
    place: text('place'),
    placeAr: text('place_ar'),
    tz: text('tz').notNull().default('Africa/Dakar'),
    status: text('status').notNull().default('active'),
    /** créée automatiquement pour un enseignant (migration, ou première classe d'un enseignant sans école) */
    personal: boolean('personal').notNull().default(false),
    accountId: uuid('account_id').references(() => account.id, { onDelete: 'restrict' }),
    createdBy: uuid('created_by').references(() => account.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('school_account').on(t.accountId),
    check('school_status', sql`${t.status} IN ('active', 'suspendue', 'fermee')`),
    check('school_name', sql`char_length(${t.name}) BETWEEN 1 AND 120`),
  ],
);

/** Personnel d'une école : direction, enseignant, secrétariat (un compte peut avoir plusieurs rôles). */
export const schoolMember = pgTable(
  'school_member',
  {
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    since: timestamp('since', { withTimezone: true }).notNull().defaultNow(),
    addedBy: uuid('added_by').references(() => account.id, { onDelete: 'set null' }),
  },
  (t) => [
    primaryKey({ columns: [t.schoolId, t.accountId, t.role] }),
    index('school_member_account').on(t.accountId),
    check('school_member_role', sql`${t.role} IN ('direction', 'enseignant', 'secretariat')`),
  ],
);

/** Enseignants d'une classe : un titulaire (au plus), des suppléants / co-enseignants. */
export const classTeacher = pgTable(
  'class_teacher',
  {
    classId: uuid('class_id')
      .notNull()
      .references(() => classGroup.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    since: timestamp('since', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.classId, t.accountId] }),
    index('class_teacher_account').on(t.accountId),
    uniqueIndex('class_teacher_un_titulaire')
      .on(t.classId)
      .where(sql`${t.role} = 'titulaire'`),
    check('class_teacher_role', sql`${t.role} IN ('titulaire', 'suppleant')`),
  ],
);

/** Année scolaire d'une école (revue E8). */
export const schoolYear = pgTable(
  'school_year',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => school.id, { onDelete: 'cascade' }),
    /** « 2026-2027 » */
    label: text('label').notNull(),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }).notNull(),
    status: text('status').notNull().default('en_cours'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => account.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('school_year_label').on(t.schoolId, t.label),
    check('school_year_status', sql`${t.status} IN ('preparation', 'en_cours', 'cloturee')`),
    check('school_year_dates', sql`${t.endsOn} > ${t.startsOn}`),
  ],
);

/**
 * Inscription DATÉE d'un élève (ligne de la liste de classe) dans une classe pour une année (revue E8) ;
 * issue décidée au passage de fin d'année. Jamais effacée au départ : c'est le registre de l'école.
 */
export const enrolment = pgTable(
  'enrolment',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    classId: uuid('class_id')
      .notNull()
      .references(() => classGroup.id, { onDelete: 'cascade' }),
    pupilId: uuid('pupil_id')
      .notNull()
      .references(() => classPupil.id, { onDelete: 'cascade' }),
    schoolYearId: uuid('school_year_id').references(() => schoolYear.id, { onDelete: 'set null' }),
    fromDay: date('from_day', { mode: 'string' }).notNull(),
    toDay: date('to_day', { mode: 'string' }),
    outcome: text('outcome').notNull().default('en_cours'),
    decidedBy: uuid('decided_by').references(() => account.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /** passage : classe de l'année suivante */
    nextClassId: uuid('next_class_id').references(() => classGroup.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('enrolment_class').on(t.classId),
    index('enrolment_pupil').on(t.pupilId),
    check(
      'enrolment_outcome',
      sql`${t.outcome} IN ('en_cours', 'admis', 'redouble', 'parti', 'transfere')`,
    ),
  ],
);

/**
 * Niveau d'un profil PAR MATIÈRE, historisé (revue E8) : une ligne ouverte (`until` nul) par matière = niveau
 * courant ; origine : test de positionnement, épreuve de passage, décision du maître, choix du parent, passage
 * de fin d'année, reprise des données (migration).
 */
export const profileLevel = pgTable(
  'profile_level',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    subjectCode: text('subject_code')
      .notNull()
      .references(() => subject.code),
    levelCode: text('level_code')
      .notNull()
      .references(() => level.code),
    since: timestamp('since', { withTimezone: true }).notNull().defaultNow(),
    until: timestamp('until', { withTimezone: true }),
    source: text('source').notNull(),
    /** issue à la fermeture : termine (niveau acquis) ou change (correction, réorientation) */
    outcome: text('outcome'),
    decidedBy: uuid('decided_by').references(() => account.id, { onDelete: 'set null' }),
    /** score du test, épreuve, classe… */
    details: jsonb('details'),
  },
  (t) => [
    index('profile_level_profile').on(t.profileId, t.subjectCode),
    uniqueIndex('profile_level_courant')
      .on(t.profileId, t.subjectCode)
      .where(sql`${t.until} IS NULL`),
    check(
      'profile_level_source',
      sql`${t.source} IN ('positionnement', 'epreuve', 'enseignant', 'parent', 'passage', 'reprise', 'inscription')`,
    ),
    check(
      'profile_level_outcome',
      sql`${t.outcome} IS NULL OR ${t.outcome} IN ('termine', 'change')`,
    ),
  ],
);

/**
 * Mots du Coran (décision du client, 05/10/2026) : lemme ↔ NIVEAU DE LIVRE qui l'enseigne, d'après les données
 * des livres (`mots_coran_1000.json` : niveau_enfants E1-E5, niveau_adultes A1-A10). Aucune hiérarchie propre.
 * Le lien ↔ LEÇON (`unit_id`) reste vide tant que les livres ne l'exportent pas ; ados : rattachement absent des
 * données (à fournir par les livres).
 */
export const quranLemma = pgTable(
  'quran_lemma',
  {
    rank: smallint('rank').primaryKey(),
    /** clé Buckwalter du Quranic Arabic Corpus (sensible à la casse) : identifiant stable du lemme */
    lemmaKey: text('lemma_key').notNull(),
    arabic: text('arabic').notNull(),
    levelEnfants: text('level_enfants').references(() => level.code),
    levelAdultes: text('level_adultes').references(() => level.code),
    levelAdos: text('level_ados').references(() => level.code),
    unitId: text('unit_id').references(() => unit.id),
    frequency: integer('frequency'),
    sourceSha256: text('source_sha256').notNull(),
  },
  (t) => [uniqueIndex('quran_lemma_key').on(t.lemmaKey)],
);

/** Mot du Coran ACQUIS par un élève (leçon de son livre terminée, niveau terminé, ou carte révisée). */
export const profileLemma = pgTable(
  'profile_lemma',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    rank: smallint('rank')
      .notNull()
      .references(() => quranLemma.rank, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.rank] }),
    check('profile_lemma_source', sql`${t.source} IN ('niveau', 'lecon', 'carte')`),
  ],
);

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

// ================================================================ entraînement (lot 6)

/**
 * Journal IMMUABLE de l'entraînement hors leçon : tracé guidé des lettres (« trace ») et révision des
 * mots en cartes (« carte »). Jamais de note : ok = tracé accepté / mot su. Sert au tableau de bord.
 */
export const practiceEvent = pgTable(
  'practice_event',
  {
    id: uuid('id').primaryKey(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    /** tracé : lettre et forme (« ب:isolee ») ; carte : mot arabe tel qu'écrit dans le livre */
    item: text('item').notNull(),
    ok: boolean('ok').notNull(),
    /** jour de l'élève (AAAA-MM-JJ) */
    day: text('day').notNull(),
    /** tracé : étape (1 à 3) et motif du refus ; carte : boîte */
    details: jsonb('details'),
    deviceAt: timestamp('device_at', { withTimezone: true }).notNull(),
    serverAt: timestamp('server_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('practice_event_profile').on(t.profileId, t.day),
    check('practice_event_kind', sql`${t.kind} IN ('trace', 'carte')`),
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

// ================================================================ tuteurs IA (lot 9)

/**
 * Journal des réponses du tuteur (ARCHITECTURE_V2 § 1.6 étape 7) : question (tronquée), décision, route,
 * événements du filtre, réponse rendue, rôle et modèle, coût. Pseudonymisé ; visible du parent pour son
 * enfant ; conservé 12 mois (purge du worker).
 */
export const tutorLog = pgTable(
  'tutor_log',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    unitId: text('unit_id'),
    roleId: text('role_id').notNull(),
    roleVersion: text('role_version').notNull(),
    provider: text('provider').notNull(),
    model: text('model'),
    action: text('action').notNull(),
    question: text('question'),
    decision: text('decision').notNull(),
    route: text('route').notNull(),
    filter: jsonb('filter'),
    segments: jsonb('segments'),
    refused: text('refused'),
    /** signalement de la réponse par l'élève ou le parent (file de modération) */
    reportedAt: timestamp('reported_at', { withTimezone: true }),
    costMicros: integer('cost_micros').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('tutor_log_profile').on(t.profileId, t.createdAt)],
);

/** Question transmise par le tuteur à l'enseignant (avis religieux, refus du modèle) ; l'humain répond. */
export const tutorQuestion = pgTable(
  'tutor_question',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    unitId: text('unit_id'),
    text: text('text').notNull(),
    motif: text('motif').notNull(),
    status: text('status').notNull().default('en_attente'),
    answer: text('answer'),
    answeredBy: uuid('answered_by').references(() => account.id, { onDelete: 'set null' }),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('tutor_question_profile').on(t.profileId),
    index('tutor_question_status').on(t.status),
    check('tutor_question_status', sql`${t.status} IN ('en_attente', 'repondue')`),
  ],
);

/** Alerte de protection (détresse, demande de rencontre) pour la modération humaine ; jamais d'enquête par l'IA. */
export const tutorAlert = pgTable('tutor_alert', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profile.id, { onDelete: 'cascade' }),
  logId: uuid('log_id').references(() => tutorLog.id, { onDelete: 'set null' }),
  motif: text('motif').notNull(),
  handledAt: timestamp('handled_at', { withTimezone: true }),
  createdAt: createdAt(),
});

// ================================================================ paiements (lot 10)

/**
 * Session de paiement (NOTRE référence) : formule, zone, montant, prestataire ; jamais de donnée de carte.
 * Le paiement se fait sur la page hébergée du prestataire (ou la page simulée) ; le résultat arrive par un
 * événement signé.
 */
export const billingCheckout = pgTable(
  'billing_checkout',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    planCode: text('plan_code').notNull(),
    zone: text('zone').notNull(),
    currency: text('currency').notNull(),
    /** unité mineure (centimes ; franc CFA sans décimales) ; licence : montant total */
    amount: integer('amount').notNull(),
    seats: integer('seats'),
    /** lot F2 (revue E1) : licence d'école achetée POUR cette école (places = élèves de l'école) */
    schoolId: uuid('school_id').references(() => school.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref'),
    status: text('status').notNull().default('ouverte'),
    createdAt: createdAt(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('billing_checkout_account').on(t.accountId),
    check(
      'billing_checkout_status',
      sql`${t.status} IN ('ouverte', 'payee', 'echouee', 'expiree')`,
    ),
  ],
);

/** Abonnement / pass / essai / licence : la SEULE source des droits d'accès (indépendante du moyen de paiement). */
export const subscription = pgTable(
  'subscription',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    planCode: text('plan_code').notNull(),
    status: text('status').notNull(),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref'),
    seats: integer('seats'),
    /**
     * lot F2 (revue E1) : licence d'école PORTÉE PAR L'ÉCOLE (le compte reste celui qui a payé) ; les licences
     * existantes sont rattachées à l'école personnelle de l'enseignant qui les avait achetées (migration 0034)
     */
    schoolId: uuid('school_id').references(() => school.id, { onDelete: 'restrict' }),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('subscription_account').on(t.accountId),
    // audit PAY-1 : un paiement (référence du prestataire) ne crée jamais deux abonnements
    uniqueIndex('subscription_provider_ref').on(t.provider, t.providerRef),
    // audit PAY-5 : un seul essai « découverte » par compte, même avec des demandes simultanées
    uniqueIndex('subscription_un_essai')
      .on(t.accountId)
      .where(sql`${t.planCode} = 'decouverte'`),
    check(
      'subscription_status',
      sql`${t.status} IN ('essai', 'active', 'annulee', 'expiree', 'impayee')`,
    ),
  ],
);

/** Événements des prestataires déjà traités (idempotence des webhooks). */
export const billingEvent = pgTable(
  'billing_event',
  {
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    checkoutId: uuid('checkout_id'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.eventId] })],
);

// ================================================================ séance du jour et régularité (lot 11)

/**
 * Régularité SANS PUNITION (ados et adultes seulement ; rien pour les enfants) : objectif de jours de
 * travail par semaine (3 à 6) et jours de repos choisis (1 = lundi … 7 = dimanche). Aucune série, aucune
 * perte, aucune notification de rattrapage.
 */
export const profileRhythm = pgTable(
  'profile_rhythm',
  {
    profileId: uuid('profile_id')
      .primaryKey()
      .references(() => profile.id, { onDelete: 'cascade' }),
    weeklyGoal: smallint('weekly_goal').notNull().default(4),
    restDays: jsonb('rest_days').notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('profile_rhythm_goal', sql`${t.weeklyGoal} BETWEEN 3 AND 6`)],
);

// ================================================================ espace école (lot 13)

/** Groupe à l'intérieur d'une classe (demi-groupes, niveaux de lecture…). */
export const classSubgroup = pgTable('class_subgroup', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  classId: uuid('class_id')
    .notNull()
    .references(() => classGroup.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

/**
 * Élève de la liste de classe (registre de l'école) : soit un profil de l'application inscrit par son
 * parent (profileId), soit un élève « papier » saisi par l'enseignant (prénom + initiale recommandés ;
 * aucune date de naissance, aucune coordonnée). Visible de l'enseignant de la classe SEULEMENT.
 */
export const classPupil = pgTable(
  'class_pupil',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    classId: uuid('class_id')
      .notNull()
      .references(() => classGroup.id, { onDelete: 'cascade' }),
    /**
     * profil de l'application (null : élève « papier »). Lot F2 : SET NULL (et non plus cascade) — si le profil
     * disparaît (compte effacé), la ligne du registre de l'école et ses notes restent, détachées.
     */
    profileId: uuid('profile_id').references(() => profile.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    nameAr: text('name_ar'),
    /** pour les variantes féminines des documents en arabe et en français ; facultatif */
    gender: text('gender'),
    groupId: uuid('group_id').references(() => classSubgroup.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    /** lot F2 (revue E8) : départ de la classe — la ligne, ses notes et ses copies sont ARCHIVÉES, jamais effacées */
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('class_pupil_profile').on(t.classId, t.profileId),
    index('class_pupil_class').on(t.classId),
    check('class_pupil_gender', sql`${t.gender} IS NULL OR ${t.gender} IN ('m', 'f')`),
  ],
);

/** Devoir : leçon, passage de hifẓ ou petit livre à lire, pour la classe ou un groupe, avec échéance. */
export const classAssignment = pgTable(
  'class_assignment',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    classId: uuid('class_id')
      .notNull()
      .references(() => classGroup.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => classSubgroup.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    /** leçon « en1.l05 », passage « 112:1-4 », livret « en1-03 » */
    target: text('target').notNull(),
    dueDay: text('due_day').notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    index('class_assignment_class').on(t.classId, t.dueDay),
    check('class_assignment_kind', sql`${t.kind} IN ('lecon', 'hifz', 'lecture')`),
  ],
);

/** Coche de l'enseignant (fait / pas fait) : prime sur le suivi automatique. */
export const assignmentMark = pgTable(
  'assignment_mark',
  {
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => classAssignment.id, { onDelete: 'cascade' }),
    pupilId: uuid('pupil_id')
      .notNull()
      .references(() => classPupil.id, { onDelete: 'cascade' }),
    done: boolean('done').notNull(),
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.assignmentId, t.pupilId] })],
);

/**
 * « Classe papier » : résultats saisis par l'enseignant (bilans et examen des livres papier, récitations,
 * productions ; récitations de hifẓ avec les relevés du barème). item : « bilan:en1.l06 », « examen »,
 * « recitations », « productions », « hifz:112:1-4 ».
 */
export const paperResult = pgTable(
  'paper_result',
  {
    pupilId: uuid('pupil_id')
      .notNull()
      .references(() => classPupil.id, { onDelete: 'cascade' }),
    levelCode: text('level_code').notNull(),
    item: text('item').notNull(),
    score: real('score').notNull(),
    max: real('max').notNull(),
    day: text('day').notNull(),
    details: jsonb('details'),
    enteredBy: uuid('entered_by').references(() => account.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.pupilId, t.levelCode, t.item] }),
    check('paper_result_score', sql`${t.max} > 0 AND ${t.score} >= 0 AND ${t.score} <= ${t.max}`),
  ],
);

/**
 * Registre des certificats et attestations délivrés (numéro unique, document figé au moment de la
 * délivrance). Conservé par l'établissement ; jamais une ijāza.
 */
export const certificate = pgTable(
  'certificate',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    number: text('number').notNull().unique(),
    kind: text('kind').notNull(),
    classId: uuid('class_id').references(() => classGroup.id, { onDelete: 'set null' }),
    pupilId: uuid('pupil_id').references(() => classPupil.id, { onDelete: 'set null' }),
    issuedBy: uuid('issued_by').references(() => account.id, { onDelete: 'set null' }),
    /** niveau (en1…) ou passage (112:1-4) */
    subject: text('subject').notNull(),
    /** REGISTRE DURABLE (preuve du diplôme ; décision du pilote, à confirmer par le juriste) : numéro,
     *  nom affiché, niveau ou passage (subject), date (issuedAt), mention */
    holderName: text('holder_name'),
    mention: text('mention'),
    /** document complet : suit les durées normales (réduit au registre 30 jours après le départ de l'élève) */
    document: jsonb('document').notNull(),
    /** l'élève a quitté la classe (ou la classe a disparu) : point de départ de la réduction du document */
    detachedAt: timestamp('detached_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    /** lot 20 : code de vérification imprimé dans le QR (aléatoire ; sans lui, rien n'est montré) */
    verifCode: text('verif_code'),
    /** signature Ed25519 (base64url) des champs du REGISTRE, et identifiant de la clé */
    signature: text('signature'),
    keyId: text('key_id'),
    /** annulation par l'enseignant (erreur, fraude) : la vérification publique l'affiche */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokeReason: text('revoke_reason'),
  },
  (t) => [
    index('certificate_class').on(t.classId),
    uniqueIndex('certificate_verif').on(t.verifCode),
    check('certificate_kind', sql`${t.kind} IN ('niveau', 'hifz')`),
  ],
);

/** Documents d'évaluation des livres (certificats, référentiel, règles), par édition. */
export const evalDoc = pgTable(
  'eval_doc',
  {
    editionId: uuid('edition_id')
      .notNull()
      .references(() => edition.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    content: jsonb('content').notNull(),
  },
  (t) => [primaryKey({ columns: [t.editionId, t.key] })],
);

// ================================================================ écoute des récitations, notifications (lot 16)

/**
 * Récitation ENVOYÉE à l'enseignant de la classe (choix de la famille, accord « envoi_recitation ») :
 * audio CHIFFRÉ (AES-256-GCM, clé hors de la base), effacé à `expiresAt` (durée courte réglée par la classe),
 * supprimable par la famille à tout moment, lisible par l'enseignant de la classe SEULEMENT, jamais utilisé
 * pour entraîner une IA.
 */
export const recitationUpload = pgTable(
  'recitation_upload',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classGroup.id, { onDelete: 'cascade' }),
    /** passage récité (« 112:1-4 ») */
    part: text('part').notNull(),
    mime: text('mime').notNull(),
    durationS: smallint('duration_s'),
    size: integer('size').notNull(),
    keyVersion: smallint('key_version').notNull(),
    iv: bytea('iv').notNull(),
    /** texte chiffré + étiquette GCM */
    ciphertext: bytea('ciphertext').notNull(),
    sentBy: uuid('sent_by').references(() => account.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    listenedAt: timestamp('listened_at', { withTimezone: true }),
    /** relevés et note /20 (grille commune des carnets) */
    grade: jsonb('grade'),
    gradedBy: uuid('graded_by').references(() => account.id, { onDelete: 'set null' }),
    gradedAt: timestamp('graded_at', { withTimezone: true }),
    /** clé d'idempotence (relais d'école : un envoi rejoué après une coupure n'est enregistré qu'une fois) */
    idempotencyKey: text('idempotency_key'),
  },
  (t) => [
    index('recitation_upload_class').on(t.classId, t.createdAt),
    index('recitation_upload_profile').on(t.profileId),
    index('recitation_upload_expires').on(t.expiresAt),
    // clé propre à chaque profil : une clé d'un autre profil ne révèle ni ne bloque rien
    uniqueIndex('recitation_upload_idem').on(t.profileId, t.idempotencyKey),
  ],
);

/** Abonnement « web push » d'un appareil (le contenu des notifications est chiffré de bout en bout). */
export const pushSubscription = pgTable('push_subscription', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  accountId: uuid('account_id')
    .notNull()
    .references(() => account.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: createdAt(),
  failures: smallint('failures').notNull().default(0),
});

/**
 * Préférences de notifications d'un compte : TOUT est désactivé par défaut ; les notifications qui
 * concernent un ENFANT demandent un accord explicite du parent (`enfants`) ; heures calmes (jamais de
 * notification entre `quietStart` et `quietEnd`, heure locale).
 */
export const notificationPref = pgTable(
  'notification_pref',
  {
    accountId: uuid('account_id')
      .primaryKey()
      .references(() => account.id, { onDelete: 'cascade' }),
    devoirs: boolean('devoirs').notNull().default(false),
    rapport: boolean('rapport').notNull().default(false),
    enfants: boolean('enfants').notNull().default(false),
    quietStart: smallint('quiet_start').notNull().default(20),
    quietEnd: smallint('quiet_end').notNull().default(8),
    tz: text('tz').notNull().default('Africa/Dakar'),
    locale: text('locale').notNull().default('fr'),
    lastDevoirs: text('last_devoirs'),
    lastRapport: text('last_rapport'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'notification_pref_hours',
      sql`${t.quietStart} BETWEEN 0 AND 23 AND ${t.quietEnd} BETWEEN 0 AND 23`,
    ),
  ],
);

// ================================================================ relais d'école (lot 17)

/**
 * Relais d'école (mini-PC ou Raspberry Pi sans Internet permanent) : sert l'application sur le Wi-Fi de
 * l'école et relaie les envois quand Internet revient. Jeton propre au relais (haché), révocable ; sous-domaine
 * propre à l'école (certificat délivré par le serveur central).
 */
export const relay = pgTable('relay', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  name: text('name').notNull(),
  /** sous-domaine de l'école (ex. ecole-dakar-01.relais.awzid.org) */
  host: text('host').notNull().unique(),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: createdAt(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  lastReport: jsonb('last_report'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

// ================================================================ correction par l'enseignant (lot 18)

/**
 * Réponse libre (exercices « question » et « ouverte » des livres, sans corrigé automatique) envoyée par la
 * famille à l'enseignant de la classe, qui la corrige : appréciation (acquis / en cours / à reprendre) et
 * commentaire court. Une réponse par élève, classe, exercice et item (un nouvel envoi remplace le texte et
 * remet la correction à zéro). Effacée avec le profil ou quand l'élève quitte la classe.
 */
export const freeAnswer = pgTable(
  'free_answer',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classGroup.id, { onDelete: 'cascade' }),
    unitId: text('unit_id')
      .notNull()
      .references(() => unit.id),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercise.id),
    itemIndex: smallint('item_index').notNull(),
    answer: text('answer').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    appreciation: text('appreciation'),
    comment: text('comment'),
    correctedBy: uuid('corrected_by').references(() => account.id, { onDelete: 'set null' }),
    correctedAt: timestamp('corrected_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('free_answer_one').on(t.profileId, t.classId, t.exerciseId, t.itemIndex),
    index('free_answer_class').on(t.classId, t.correctedAt),
    check('free_answer_len', sql`char_length(${t.answer}) BETWEEN 1 AND 2000`),
    check(
      'free_answer_appreciation',
      sql`${t.appreciation} IS NULL OR ${t.appreciation} IN ('acquis', 'en_cours', 'a_reprendre')`,
    ),
    check('free_answer_comment', sql`${t.comment} IS NULL OR char_length(${t.comment}) <= 600`),
  ],
);

// ================================================================ signalements d'erreurs (lot F1, revue M1)

/**
 * Rôles portés par un compte EN PLUS de son type (lot F1 ; amorce de la revue E2) : « referent » = référent
 * religieux (traite la file des signalements de contenu, valide les traductions religieuses). Attribué par
 * l'outil `staff` (propriétaire de la base), jamais par l'API.
 */
export const ACCOUNT_ROLES = [
  'parent',
  'eleve_adulte',
  'enseignant',
  'direction',
  'secretariat',
  'referent',
  'moderateur',
  'support',
  'admin',
] as const;
export type AccountRoleName = (typeof ACCOUNT_ROLES)[number];

/**
 * Lot F2 (revue E2) : rôles MULTIPLES d'un compte, avec une PORTÉE (école, classe ou toute la plateforme).
 * Les rôles d'école (direction, enseignant, secrétariat) vivent dans `school_member` et sont ajoutés aux rôles
 * de la session à la lecture ; ici : parent, élève adulte, référent, modérateur, support, administrateur…
 */
export const accountRole = pgTable(
  'account_role',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    schoolId: uuid('school_id').references(() => school.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').references(() => classGroup.id, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    grantedBy: uuid('granted_by').references(() => account.id, { onDelete: 'set null' }),
  },
  (t) => [
    unique('account_role_unique').on(t.accountId, t.role, t.schoolId, t.classId).nullsNotDistinct(),
    check(
      'account_role_role',
      sql`${t.role} IN ('parent', 'eleve_adulte', 'enseignant', 'direction', 'secretariat', 'referent', 'moderateur', 'support', 'admin')`,
    ),
  ],
);

/**
 * « Signaler une erreur » sur un verset, un hadith, une règle de fiqh, une leçon ou un exercice. Minimisation :
 * aucun pseudonyme ni profil, le compte n'est gardé que pour limiter les abus (jamais montré au référent) ;
 * commentaire court. File de traitement : reçu → en examen → corrigé (erratum public) ou rejeté (motif).
 */
export const contentReport = pgTable(
  'content_report',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    accountId: uuid('account_id').references(() => account.id, { onDelete: 'set null' }),
    editionId: uuid('edition_id').references(() => edition.id, { onDelete: 'set null' }),
    targetKind: text('target_kind').notNull(),
    unitId: text('unit_id').references(() => unit.id),
    /** chemin du bloc dans la projection élève (`""` = la leçon, `ex:<id>` = un exercice) */
    path: text('path').notNull().default(''),
    /** référence affichée (ex. « 2:255 », source du hadith) */
    ref: text('ref'),
    /** extrait du texte signalé, tel qu'affiché */
    excerpt: text('excerpt'),
    /** empreinte du bloc signalé (suspension ciblée) */
    fp: text('fp'),
    reason: text('reason').notNull(),
    comment: text('comment'),
    status: text('status').notNull().default('recu'),
    /** motif du rejet, ou note interne de correction */
    decisionNote: text('decision_note'),
    /** erratum PUBLIC (statut « corrige ») */
    erratum: text('erratum'),
    /** édition qui porte la correction */
    fixedInEdition: text('fixed_in_edition'),
    handledBy: uuid('handled_by').references(() => account.id, { onDelete: 'set null' }),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('content_report_status').on(t.status, t.createdAt),
    index('content_report_account').on(t.accountId, t.createdAt),
    check(
      'content_report_kind',
      sql`${t.targetKind} IN ('verset', 'hadith', 'fiqh', 'lecon', 'exercice')`,
    ),
    check(
      'content_report_reason',
      sql`${t.reason} IN ('texte_arabe', 'sens', 'reference', 'regle', 'corrige', 'orthographe', 'autre')`,
    ),
    check('content_report_status', sql`${t.status} IN ('recu', 'en_examen', 'corrige', 'rejete')`),
    check(
      'content_report_rejet',
      sql`${t.status} <> 'rejete' OR char_length(coalesce(${t.decisionNote}, '')) > 0`,
    ),
    check(
      'content_report_lengths',
      sql`char_length(coalesce(${t.comment}, '')) <= 500 AND char_length(coalesce(${t.excerpt}, '')) <= 300 AND char_length(coalesce(${t.ref}, '')) <= 120 AND char_length(coalesce(${t.erratum}, '')) <= 600 AND char_length(coalesce(${t.decisionNote}, '')) <= 1000`,
    ),
  ],
);

/**
 * Suspension d'urgence d'un contenu par l'administrateur (entre deux éditions) : la leçon, l'exercice ou le
 * bloc est masqué PARTOUT (API, paquets hors ligne, page du QR code, appareils au prochain contact) avec un
 * message neutre. Levée datée (la trace reste).
 */
export const contentSuspension = pgTable(
  'content_suspension',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    unitId: text('unit_id')
      .notNull()
      .references(() => unit.id),
    path: text('path').notNull().default(''),
    fp: text('fp'),
    reportId: uuid('report_id').references(() => contentReport.id, { onDelete: 'set null' }),
    /** motif interne (jamais affiché aux élèves) */
    reason: text('reason').notNull(),
    createdBy: uuid('created_by').references(() => account.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    liftedAt: timestamp('lifted_at', { withTimezone: true }),
    liftedBy: uuid('lifted_by').references(() => account.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('content_suspension_active')
      .on(t.unitId, t.path)
      .where(sql`${t.liftedAt} IS NULL`),
    check('content_suspension_reason', sql`char_length(${t.reason}) BETWEEN 1 AND 500`),
  ],
);

// ================================================================ épreuves notées (lot 19)

/**
 * Session d'épreuve ouverte par l'enseignant pour sa classe : un bilan (barème /20) ou l'examen (/100) du
 * niveau de la classe, entre deux dates. `seed` (jamais transmis) mélange la colonne de droite des « relier »
 * pour chaque élève, afin que la réponse ne se déduise pas de l'ordre affiché.
 */
export const examSession = pgTable(
  'exam_session',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    classId: uuid('class_id')
      .notNull()
      .references(() => classGroup.id, { onDelete: 'cascade' }),
    unitId: text('unit_id')
      .notNull()
      .references(() => unit.id),
    /**
     * Édition FIGÉE à l'ouverture (lot F1, revue M2 ; CDC §5.8) : énoncé, corrigé et barème sont lus dans
     * cette édition jusqu'à la fermeture, même si une nouvelle édition est publiée entre-temps.
     */
    editionId: uuid('edition_id')
      .notNull()
      .references(() => edition.id),
    bareme: smallint('bareme').notNull(),
    opensAt: timestamp('opens_at', { withTimezone: true }).notNull(),
    closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
    seed: text('seed').notNull(),
    createdBy: uuid('created_by').references(() => account.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('exam_session_class').on(t.classId, t.opensAt),
    check('exam_session_bareme', sql`${t.bareme} IN (20, 100)`),
    check('exam_session_dates', sql`${t.closesAt} > ${t.opensAt}`),
  ],
);

/** Copie d'un élève (une seule par session) : réponses, points automatiques, partie notée par l'enseignant. */
export const examSubmission = pgTable(
  'exam_submission',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => examSession.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    answers: jsonb('answers').notNull(),
    autoPoints: smallint('auto_points').notNull(),
    autoMax: smallint('auto_max').notNull(),
    detail: jsonb('detail').notNull(),
    teacherPoints: real('teacher_points'),
    teacherMax: real('teacher_max'),
    score: real('score'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    gradedAt: timestamp('graded_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('exam_submission_one').on(t.sessionId, t.profileId),
    check(
      'exam_submission_teacher',
      sql`(${t.teacherPoints} IS NULL AND ${t.teacherMax} IS NULL) OR (${t.teacherMax} > 0 AND ${t.teacherPoints} BETWEEN 0 AND ${t.teacherMax})`,
    ),
  ],
);

// ================================================================ messagerie encadrée et visio (lot 21)

/**
 * Fil PRIVÉ enseignant ↔ famille (CDC §2.12) : toujours à propos d'un élève inscrit dans la classe de
 * l'enseignant ; le titulaire du compte famille (parent, ou adulte pour lui-même) est l'interlocuteur.
 * Aucun fil entre élèves ni entre un adulte et un mineur.
 */
export const messageThread = pgTable(
  'message_thread',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    classId: uuid('class_id')
      .notNull()
      .references(() => classGroup.id, { onDelete: 'cascade' }),
    teacherAccountId: uuid('teacher_account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    familyAccountId: uuid('family_account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    lastAt: timestamp('last_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('message_thread_one').on(t.classId, t.profileId)],
);

/**
 * Message : privé (dans un fil) ou ANNONCE de classe (enseignant → familles, sans réponse collective).
 * Corps CHIFFRÉ (AES-256-GCM, clé AWFORM_MESSAGE_KEY hors base, version de clé) ; pièce jointe de
 * l'enseignant seulement (PNG, JPEG ou PDF vérifiés par leur signature, 2 Mo), chiffrée aussi.
 */
export const message = pgTable(
  'message',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    classId: uuid('class_id')
      .notNull()
      .references(() => classGroup.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').references(() => messageThread.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    authorAccountId: uuid('author_account_id').references(() => account.id, {
      onDelete: 'set null',
    }),
    keyVersion: smallint('key_version').notNull(),
    iv: bytea('iv').notNull(),
    body: bytea('body').notNull(),
    attachmentName: text('attachment_name'),
    attachmentMime: text('attachment_mime'),
    attachmentIv: bytea('attachment_iv'),
    attachment: bytea('attachment'),
    createdAt: createdAt(),
    /** retiré par la modération (le texte est effacé, la trace reste) */
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    index('message_by_thread').on(t.threadId, t.createdAt),
    index('message_by_class').on(t.classId, t.createdAt),
    index('message_created').on(t.createdAt),
    check('message_kind', sql`${t.kind} IN ('prive', 'annonce')`),
    check('message_thread_kind', sql`(${t.kind} = 'prive') = (${t.threadId} IS NOT NULL)`),
  ],
);

/** Lecture d'un message par un compte (non lus). */
export const messageRead = pgTable(
  'message_read',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.accountId] })],
);

/** Signalement d'un message → file de modération de l'administrateur. */
export const messageReport = pgTable(
  'message_report',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    messageId: uuid('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),
    reporterAccountId: uuid('reporter_account_id').references(() => account.id, {
      onDelete: 'set null',
    }),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    handledBy: uuid('handled_by').references(() => account.id, { onDelete: 'set null' }),
    decision: text('decision'),
  },
  (t) => [
    uniqueIndex('message_report_one').on(t.messageId, t.reporterAccountId),
    check(
      'message_report_decision',
      sql`${t.decision} IS NULL OR ${t.decision} IN ('classe', 'retire')`,
    ),
  ],
);

/**
 * Séance de visio planifiée (CDC §2.11) : la visio passe par un service EXTERNE (lien https) ; l'application
 * gère le planning, le lien réservé aux membres de la classe et la présence.
 */
export const videoSession = pgTable(
  'video_session',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    classId: uuid('class_id')
      .notNull()
      .references(() => classGroup.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    durationMin: smallint('duration_min').notNull(),
    url: text('url').notNull(),
    provider: text('provider').notNull(),
    createdBy: uuid('created_by').references(() => account.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
  },
  (t) => [
    index('video_session_class').on(t.classId, t.startsAt),
    check('video_session_duration', sql`${t.durationMin} BETWEEN 10 AND 240`),
  ],
);

/** Présence notée par l'enseignant (élèves de la liste de classe, papier compris). */
export const videoPresence = pgTable(
  'video_presence',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => videoSession.id, { onDelete: 'cascade' }),
    pupilId: uuid('pupil_id')
      .notNull()
      .references(() => classPupil.id, { onDelete: 'cascade' }),
    present: boolean('present').notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.pupilId] })],
);

// ================================================================ carnet de pratique et suivi des sourates (lot 22)

/**
 * Case cochée par l'enfant dans le carnet de pratique d'une leçon de Religion (exercice `carnet` du livre) :
 * semaine (lundi), ligne du livre, jour (0 = lundi). Jamais notée (le carnet encourage, ne sanctionne pas).
 */
export const practiceCheck = pgTable(
  'practice_check',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercise.id),
    week: date('week').notNull(),
    line: smallint('line').notNull(),
    day: smallint('day').notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.exerciseId, t.week, t.line, t.day] }),
    check('practice_check_day', sql`${t.day} BETWEEN 0 AND 6`),
    check('practice_check_line', sql`${t.line} BETWEEN 0 AND 49`),
  ],
);

/** Signature du parent pour une semaine du carnet : code parent vérifié par le serveur ; la semaine est ensuite close. */
export const practiceSignature = pgTable(
  'practice_signature',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercise.id),
    week: date('week').notNull(),
    signedBy: uuid('signed_by')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.exerciseId, t.week] })],
);

/**
 * Suivi d'une sourate du livre (`book.js` → `sourates`) : 1 j'écoute, 2 je répète, 3 je récite seul (famille),
 * 4 validé par l'enseignant (seul l'enseignant de la classe le pose).
 */
export const suraProgress = pgTable(
  'sura_progress',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    sura: smallint('sura').notNull(),
    step: smallint('step').notNull(),
    validatedBy: uuid('validated_by').references(() => account.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.sura] }),
    check('sura_progress_sura', sql`${t.sura} BETWEEN 1 AND 114`),
    check('sura_progress_step', sql`${t.step} BETWEEN 1 AND 4`),
  ],
);

/**
 * Cas pratique non résolu des livres ra* (décision du 04/10/2026) : réponse écrite par un ADULTE qui apprend
 * seul ; condition pour voir la réponse proposée par le livre (`cas` = « r<rubrique>c<cas> »). Jamais notée.
 */
export const casTentative = pgTable(
  'cas_tentative',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    unitId: text('unit_id')
      .notNull()
      .references(() => unit.id),
    cas: text('cas').notNull(),
    texte: text('texte').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.unitId, t.cas] })],
);

/**
 * Carnet personnel des livres ra* (décision du 04/10/2026) : la ligne `carnet` de chaque leçon, cochée par un
 * ADULTE quand c'est fait (une ligne présente = cochée). Sans signature, jamais notée.
 */
export const carnetPerso = pgTable(
  'carnet_perso',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id, { onDelete: 'cascade' }),
    unitId: text('unit_id')
      .notNull()
      .references(() => unit.id),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.unitId] })],
);

// ================================================================ codes d'activation imprimés (lot 23)

/** Lot de codes imprimés pour un niveau (généré par l'administrateur ; codes montrés une seule fois). */
export const activationBatch = pgTable(
  'activation_batch',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    levelCode: text('level_code')
      .notNull()
      .references(() => level.code),
    label: text('label').notNull(),
    months: smallint('months').notNull(),
    quantity: integer('quantity').notNull(),
    /** après cette date, un code non utilisé n'ouvre plus rien (null : sans limite) */
    redeemBy: timestamp('redeem_by', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => account.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    check('activation_batch_months', sql`${t.months} BETWEEN 1 AND 24`),
    check('activation_batch_quantity', sql`${t.quantity} BETWEEN 1 AND 5000`),
  ],
);

/** Code à usage unique : seule son empreinte est gardée (le code en clair n'existe que sur le papier). */
export const activationCode = pgTable(
  'activation_code',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => activationBatch.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    /** 4 derniers caractères, pour l'assistance */
    last4: text('last4').notNull(),
    redeemedBy: uuid('redeemed_by').references(() => account.id, { onDelete: 'set null' }),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('activation_code_hash').on(t.codeHash),
    index('activation_code_batch').on(t.batchId),
  ],
);

/** Accès à un niveau ouvert par un code (12 mois en général) ; indépendant des abonnements. */
export const levelPass = pgTable(
  'level_pass',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    levelCode: text('level_code')
      .notNull()
      .references(() => level.code),
    codeId: uuid('code_id')
      .notNull()
      .references(() => activationCode.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('level_pass_code').on(t.codeId),
    index('level_pass_account').on(t.accountId, t.levelCode),
  ],
);

// ---------------------------------------------------------------- suite V1-b : récital de hifẓ (CDC §2.6)

/**
 * Récital de fin de niveau (séance devant l'enseignant, CDC §2.6-6) : passages TIRÉS AU SORT par le serveur
 * dans le carnet de hifẓ (3 du socle, + 1 du renforcé si parcours renforcé) + un passage au choix de l'élève ;
 * compteurs du barème du carnet → note /20 et mention (calcul existant), note Coran /15 = récital × 0,75.
 * Jamais d'ijāza ni de classement ; aucun texte coranique stocké (numéros de sourate et de versets seulement).
 */
export const hifzRecital = pgTable(
  'hifz_recital',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    classId: uuid('class_id')
      .notNull()
      .references(() => classGroup.id, { onDelete: 'cascade' }),
    /** carnet de hifẓ du livre (en1, ad1…) dont les passages sont tirés */
    bookCode: text('book_code').notNull(),
    title: text('title').notNull(),
    day: date('day').notNull(),
    createdBy: uuid('created_by').references(() => account.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    /** résultat officiel publié : les notes sont figées et visibles par les familles */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
  },
  (t) => [index('hifz_recital_class').on(t.classId, t.day)],
);

/** Passage d'un élève au récital : tirage, compteurs, note. */
export const hifzRecitalEntry = pgTable(
  'hifz_recital_entry',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    recitalId: uuid('recital_id')
      .notNull()
      .references(() => hifzRecital.id, { onDelete: 'cascade' }),
    pupilId: uuid('pupil_id')
      .notNull()
      .references(() => classPupil.id, { onDelete: 'cascade' }),
    parcours: text('parcours').notNull(),
    /** passages tirés au sort (« 112:1-4 »…), dans l'ordre du tirage */
    drawn: jsonb('drawn').notNull(),
    /** passage choisi par l'élève (dans le carnet) */
    choice: text('choice'),
    counters: jsonb('counters'),
    /** note calculée par le barème (mémorisation, tajwid, fluidité, total, mention, validation) */
    note: jsonb('note'),
    /** jury (facultatif) : second récitant présent */
    secondJury: boolean('second_jury').notNull().default(false),
    drawnAt: timestamp('drawn_at', { withTimezone: true }).notNull().defaultNow(),
    scoredAt: timestamp('scored_at', { withTimezone: true }),
    scoredBy: uuid('scored_by').references(() => account.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('hifz_recital_entry_pupil').on(t.recitalId, t.pupilId),
    index('hifz_recital_entry_pupil_idx').on(t.pupilId),
    check('hifz_recital_entry_parcours', sql`${t.parcours} IN ('socle', 'renforce')`),
  ],
);

// ================================================================ audio du Coran (lot 27)

/**
 * Récitateur (un MUṢḤAF enregistré : une voix dans une riwāya). Fichiers hébergés chez nous (Complexe du Roi
 * Fahd, licence archivée). Statut : « en_attente » tant que l'import n'a pas passé tous ses contrôles,
 * « actif » après activation, « retire » (coupure immédiate : réponses, paquets et fichiers) avec date et motif.
 */
export const quranReciter = pgTable(
  'quran_reciter',
  {
    /** identifiant stable, ex. « ayyoub-hafs » */
    id: text('id').primaryKey(),
    nameAr: text('name_ar').notNull(),
    nameFr: text('name_fr').notNull(),
    /** hafs, shuba, qalun, warsh, susi, duri… (voir RIWAYAT dans coran-audio.ts) */
    riwaya: text('riwaya').notNull(),
    /** étiquettes d'écoute ; null = pas encore étiquetée */
    speed: text('speed'),
    style: text('style'),
    /** nombre de versets du muṣḥaf complet (Ḥafṣ : 6 236, compte koufi ; autres riwāyāt : compte déclaré) */
    expectedVerses: integer('expected_verses').notNull(),
    licenseSource: text('license_source').notNull(),
    licenseUrl: text('license_url').notNull(),
    licenseArchivedOn: date('license_archived_on').notNull(),
    licenseText: text('license_text').notNull(),
    /** crédit à afficher partout où la récitation est proposée */
    credit: text('credit').notNull(),
    /** crédit en arabe (chantier A1) */
    creditAr: text('credit_ar').notNull().default(''),
    /** condition d'usage affichée avec le crédit (ex. « ne pas vendre l'audio ») */
    usageNote: text('usage_note').notNull().default(''),
    status: text('status').notNull().default('en_attente'),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    retiredReason: text('retired_reason'),
    createdAt: createdAt(),
  },
  (t) => [
    check('quran_reciter_id', sql`${t.id} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check(
      'quran_reciter_riwaya',
      sql`${t.riwaya} IN ('hafs', 'shuba', 'warsh', 'qalun', 'bazzi', 'qunbul', 'duri', 'susi', 'hisham', 'ibn_dhakwan', 'khalaf', 'khallad', 'abu_al_harith', 'duri_kisai', 'ibn_wardan', 'ibn_jammaz', 'ruways', 'rawh', 'ishaq', 'idris')`,
    ),
    check(
      'quran_reciter_speed',
      sql`${t.speed} IS NULL OR ${t.speed} IN ('lente', 'moyenne', 'rapide')`,
    ),
    check(
      'quran_reciter_style',
      sql`${t.style} IS NULL OR ${t.style} IN ('murattal', 'mujawwad', 'muallim')`,
    ),
    check('quran_reciter_status', sql`${t.status} IN ('en_attente', 'actif', 'retire')`),
    check(
      'quran_reciter_retrait',
      sql`${t.status} <> 'retire' OR (${t.retiredAt} IS NOT NULL AND length(${t.retiredReason}) > 0)`,
    ),
    check('quran_reciter_versets', sql`${t.expectedVerses} BETWEEN 1 AND 6300`),
  ],
);

/** Import d'un dossier de fichiers (un par verset) : contrôles et rapport, même quand il est bloqué. */
export const quranAudioImport = pgTable(
  'quran_audio_import',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    reciterId: text('reciter_id')
      .notNull()
      .references(() => quranReciter.id, { onDelete: 'cascade' }),
    sourceDir: text('source_dir').notNull(),
    pattern: text('pattern').notNull(),
    /** bloque : un contrôle a échoué, rien n'est changé ; importe : pistes en place ; active : et activé */
    status: text('status').notNull(),
    tracks: integer('tracks').notNull().default(0),
    totalBytes: bigint('total_bytes', { mode: 'number' }).notNull().default(0),
    totalMs: bigint('total_ms', { mode: 'number' }).notNull().default(0),
    blocking: integer('blocking').notNull().default(0),
    warnings: integer('warnings').notNull().default(0),
    report: jsonb('report').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('quran_audio_import_reciter').on(t.reciterId),
    check('quran_audio_import_status', sql`${t.status} IN ('bloque', 'importe', 'active')`),
  ],
);

/** Piste : un verset d'un récitateur (numérotation de SA riwāya). Fichier nommé par son empreinte. */
export const quranTrack = pgTable(
  'quran_track',
  {
    reciterId: text('reciter_id')
      .notNull()
      .references(() => quranReciter.id, { onDelete: 'cascade' }),
    sura: smallint('sura').notNull(),
    aya: smallint('aya').notNull(),
    /** chemin relatif au stockage audio (AWFORM_AUDIO_DIR) */
    path: text('path').notNull(),
    durationMs: integer('duration_ms').notNull(),
    bytes: integer('bytes').notNull(),
    sha256: text('sha256').notNull(),
    format: text('format').notNull(),
    importId: uuid('import_id').references(() => quranAudioImport.id, { onDelete: 'set null' }),
  },
  (t) => [
    primaryKey({ columns: [t.reciterId, t.sura, t.aya] }),
    check('quran_track_sura', sql`${t.sura} BETWEEN 1 AND 114`),
    check('quran_track_aya', sql`${t.aya} BETWEEN 0 AND 286`),
    check('quran_track_duree', sql`${t.durationMs} > 0`),
    check('quran_track_taille', sql`${t.bytes} > 0`),
    check('quran_track_sha', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    check('quran_track_format', sql`${t.format} IN ('mp3', 'wav', 'ogg', 'opus', 'm4a')`),
    check('quran_track_chemin', sql`${t.path} !~ '(^/|\\.\\.)'`),
  ],
);

/** Récitateur choisi par le profil (sinon : conseil débutant). */
export const profileReciterPref = pgTable('profile_reciter_pref', {
  profileId: uuid('profile_id')
    .primaryKey()
    .references(() => profile.id, { onDelete: 'cascade' }),
  reciterId: text('reciter_id')
    .notNull()
    .references(() => quranReciter.id, { onDelete: 'cascade' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Liste AUTORISÉE par le parent pour un profil mineur (absente : pas de restriction du parent). */
export const profileReciterRule = pgTable('profile_reciter_rule', {
  profileId: uuid('profile_id')
    .primaryKey()
    .references(() => profile.id, { onDelete: 'cascade' }),
  allowed: text('allowed').array().notNull(),
  setBy: uuid('set_by').references(() => account.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Liste AUTORISÉE par l'enseignant pour les élèves d'une classe (absente : pas de restriction). */
export const classReciterRule = pgTable('class_reciter_rule', {
  classId: uuid('class_id')
    .primaryKey()
    .references(() => classGroup.id, { onDelete: 'cascade' }),
  allowed: text('allowed').array().notNull(),
  setBy: uuid('set_by').references(() => account.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Récitateurs préchargés par le relais d'une école (choix de l'école, enregistré par l'équipe). */
export const relayReciter = pgTable(
  'relay_reciter',
  {
    relayId: uuid('relay_id')
      .notNull()
      .references(() => relay.id, { onDelete: 'cascade' }),
    reciterId: text('reciter_id')
      .notNull()
      .references(() => quranReciter.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.relayId, t.reciterId] })],
);
