-- Lot F2 (revue d'architecture E1, E2, E3, E4, E8) : STRUCTURE — école, personnel, enseignants de classe, rôles
-- multiples avec portée, responsables d'un profil (parent, école), mode tablette de classe, matières, niveau par
-- matière historisé, année scolaire, inscription datée, mots du Coran rattachés au niveau du livre.
-- account.kind : type énuméré → texte contrôlé (ajout de « ecole » utilisable dans la même transaction).
-- class_group.teacher_account_id : cascade → RESTRICT (plus d'effacement des classes avec le compte) ;
-- class_pupil.profile_id : cascade → SET NULL (la ligne du registre et ses notes restent).
-- Reprise des données : 0035 (écoles), 0036 (niveaux, années), 0037 (responsables).
-- Retour arrière (manuel, APRÈS celui de 0037, 0036, 0035) :
--   DROP TABLE profile_lemma, quran_lemma, profile_level, enrolment, class_teacher, school_member,
--     profile_custodian CASCADE;
--   ALTER TABLE class_group DROP COLUMN school_id, DROP COLUMN school_year_id, DROP COLUMN subject_code,
--     DROP COLUMN kind, DROP COLUMN portion, DROP COLUMN status, DROP COLUMN archived_at;
--   DROP TABLE school_year; ALTER TABLE subscription DROP COLUMN school_id; ALTER TABLE billing_checkout DROP
--     COLUMN school_id; ALTER TABLE account_role DROP COLUMN school_id, DROP COLUMN class_id, DROP COLUMN
--     granted_by; DELETE FROM account_role WHERE role <> 'referent'; ALTER TABLE account_role DROP COLUMN id,
--     DROP CONSTRAINT account_role_role, ADD PRIMARY KEY (account_id, role),
--     ADD CONSTRAINT account_role_role CHECK (role IN ('referent'));
--   ALTER TABLE session DROP COLUMN tablet_class_id, DROP COLUMN tablet_opened_by; DELETE FROM session WHERE
--     account_id IN (SELECT id FROM account WHERE kind = 'ecole'); UPDATE profile SET owner_account_id = … (profils
--     d'école : à rattacher à un compte parent avant), DELETE FROM account WHERE kind = 'ecole'; DROP TABLE school;
--   ALTER TABLE level DROP COLUMN subject_code; DROP TABLE subject; ALTER TABLE class_pupil DROP COLUMN left_at;
--   CREATE TYPE account_kind AS ENUM ('parent','adulte','admin','enseignant'); ALTER TABLE account DROP
--     CONSTRAINT account_kind_check, ALTER COLUMN kind TYPE account_kind USING kind::account_kind;
--   ALTER TABLE class_group ALTER COLUMN teacher_account_id SET NOT NULL (classes sans titulaire : en donner un),
--     DROP CONSTRAINT class_group_teacher_account_id_account_id_fk, ADD CONSTRAINT … ON DELETE cascade ;
--   class_pupil.profile_id : même chose (ON DELETE cascade).
CREATE TABLE "class_teacher" (
	"class_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role" text NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_teacher_class_id_account_id_pk" PRIMARY KEY("class_id","account_id"),
	CONSTRAINT "class_teacher_role" CHECK ("class_teacher"."role" IN ('titulaire', 'suppleant'))
);
--> statement-breakpoint
CREATE TABLE "enrolment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_id" uuid NOT NULL,
	"pupil_id" uuid NOT NULL,
	"school_year_id" uuid,
	"from_day" date NOT NULL,
	"to_day" date,
	"outcome" text DEFAULT 'en_cours' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"next_class_id" uuid,
	CONSTRAINT "enrolment_outcome" CHECK ("enrolment"."outcome" IN ('en_cours', 'admis', 'redouble', 'parti', 'transfere'))
);
--> statement-breakpoint
CREATE TABLE "profile_custodian" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"profile_id" uuid NOT NULL,
	"nature" text NOT NULL,
	"account_id" uuid,
	"school_id" uuid,
	"status" text DEFAULT 'actif' NOT NULL,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	"evidence" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	CONSTRAINT "profile_custodian_nature" CHECK ("profile_custodian"."nature" IN ('parent', 'ecole', 'emancipation')),
	CONSTRAINT "profile_custodian_status" CHECK ("profile_custodian"."status" IN ('invite', 'actif', 'termine')),
	CONSTRAINT "profile_custodian_cible" CHECK (("profile_custodian"."nature" = 'ecole' AND "profile_custodian"."school_id" IS NOT NULL) OR ("profile_custodian"."nature" <> 'ecole' AND ("profile_custodian"."account_id" IS NOT NULL OR "profile_custodian"."status" = 'invite' OR "profile_custodian"."status" = 'termine')))
);
--> statement-breakpoint
CREATE TABLE "profile_lemma" (
	"profile_id" uuid NOT NULL,
	"rank" smallint NOT NULL,
	"source" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_lemma_profile_id_rank_pk" PRIMARY KEY("profile_id","rank"),
	CONSTRAINT "profile_lemma_source" CHECK ("profile_lemma"."source" IN ('niveau', 'lecon', 'carte'))
);
--> statement-breakpoint
CREATE TABLE "profile_level" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_code" text NOT NULL,
	"level_code" text NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	"until" timestamp with time zone,
	"source" text NOT NULL,
	"outcome" text,
	"decided_by" uuid,
	"details" jsonb,
	CONSTRAINT "profile_level_source" CHECK ("profile_level"."source" IN ('positionnement', 'epreuve', 'enseignant', 'parent', 'passage', 'reprise', 'inscription')),
	CONSTRAINT "profile_level_outcome" CHECK ("profile_level"."outcome" IS NULL OR "profile_level"."outcome" IN ('termine', 'change'))
);
--> statement-breakpoint
CREATE TABLE "quran_lemma" (
	"rank" smallint PRIMARY KEY NOT NULL,
	"lemma_key" text NOT NULL,
	"arabic" text NOT NULL,
	"level_enfants" text,
	"level_adultes" text,
	"level_ados" text,
	"unit_id" text,
	"frequency" integer,
	"source_sha256" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"country" text,
	"place" text,
	"place_ar" text,
	"tz" text DEFAULT 'Africa/Dakar' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"personal" boolean DEFAULT false NOT NULL,
	"account_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_status" CHECK ("school"."status" IN ('active', 'suspendue', 'fermee')),
	CONSTRAINT "school_name" CHECK (char_length("school"."name") BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE TABLE "school_member" (
	"school_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role" text NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" uuid,
	CONSTRAINT "school_member_school_id_account_id_role_pk" PRIMARY KEY("school_id","account_id","role"),
	CONSTRAINT "school_member_role" CHECK ("school_member"."role" IN ('direction', 'enseignant', 'secretariat'))
);
--> statement-breakpoint
CREATE TABLE "school_year" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"school_id" uuid NOT NULL,
	"label" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" text DEFAULT 'en_cours' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	CONSTRAINT "school_year_status" CHECK ("school_year"."status" IN ('preparation', 'en_cours', 'cloturee')),
	CONSTRAINT "school_year_dates" CHECK ("school_year"."ends_on" > "school_year"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "subject" (
	"code" text PRIMARY KEY NOT NULL,
	"title_fr" text NOT NULL,
	"rank" smallint NOT NULL,
	"has_levels" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_role" DROP CONSTRAINT "account_role_role";--> statement-breakpoint
ALTER TABLE "class_group" DROP CONSTRAINT "class_group_teacher_account_id_account_id_fk";
--> statement-breakpoint
ALTER TABLE "class_pupil" DROP CONSTRAINT "class_pupil_profile_id_profile_id_fk";
--> statement-breakpoint
ALTER TABLE "account_role" DROP CONSTRAINT "account_role_account_id_role_pk";--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "class_group" ALTER COLUMN "teacher_account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account_role" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL;--> statement-breakpoint
ALTER TABLE "account_role" ADD COLUMN "school_id" uuid;--> statement-breakpoint
ALTER TABLE "account_role" ADD COLUMN "class_id" uuid;--> statement-breakpoint
ALTER TABLE "account_role" ADD COLUMN "granted_by" uuid;--> statement-breakpoint
ALTER TABLE "billing_checkout" ADD COLUMN "school_id" uuid;--> statement-breakpoint
ALTER TABLE "class_group" ADD COLUMN "school_id" uuid;--> statement-breakpoint
ALTER TABLE "class_group" ADD COLUMN "school_year_id" uuid;--> statement-breakpoint
ALTER TABLE "class_group" ADD COLUMN "subject_code" text;--> statement-breakpoint
ALTER TABLE "class_group" ADD COLUMN "kind" text DEFAULT 'classe' NOT NULL;--> statement-breakpoint
ALTER TABLE "class_group" ADD COLUMN "portion" text;--> statement-breakpoint
ALTER TABLE "class_group" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "class_group" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "class_pupil" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "level" ADD COLUMN "subject_code" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "tablet_class_id" uuid;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "tablet_opened_by" uuid;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "school_id" uuid;--> statement-breakpoint
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_pupil_id_class_pupil_id_fk" FOREIGN KEY ("pupil_id") REFERENCES "public"."class_pupil"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_school_year_id_school_year_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_year"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_decided_by_account_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_next_class_id_class_group_id_fk" FOREIGN KEY ("next_class_id") REFERENCES "public"."class_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_custodian" ADD CONSTRAINT "profile_custodian_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_custodian" ADD CONSTRAINT "profile_custodian_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_custodian" ADD CONSTRAINT "profile_custodian_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_custodian" ADD CONSTRAINT "profile_custodian_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_lemma" ADD CONSTRAINT "profile_lemma_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_lemma" ADD CONSTRAINT "profile_lemma_rank_quran_lemma_rank_fk" FOREIGN KEY ("rank") REFERENCES "public"."quran_lemma"("rank") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_level" ADD CONSTRAINT "profile_level_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_level" ADD CONSTRAINT "profile_level_subject_code_subject_code_fk" FOREIGN KEY ("subject_code") REFERENCES "public"."subject"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_level" ADD CONSTRAINT "profile_level_level_code_level_code_fk" FOREIGN KEY ("level_code") REFERENCES "public"."level"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_level" ADD CONSTRAINT "profile_level_decided_by_account_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quran_lemma" ADD CONSTRAINT "quran_lemma_level_enfants_level_code_fk" FOREIGN KEY ("level_enfants") REFERENCES "public"."level"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quran_lemma" ADD CONSTRAINT "quran_lemma_level_adultes_level_code_fk" FOREIGN KEY ("level_adultes") REFERENCES "public"."level"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quran_lemma" ADD CONSTRAINT "quran_lemma_level_ados_level_code_fk" FOREIGN KEY ("level_ados") REFERENCES "public"."level"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quran_lemma" ADD CONSTRAINT "quran_lemma_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school" ADD CONSTRAINT "school_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school" ADD CONSTRAINT "school_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_member" ADD CONSTRAINT "school_member_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_member" ADD CONSTRAINT "school_member_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_member" ADD CONSTRAINT "school_member_added_by_account_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_year" ADD CONSTRAINT "school_year_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_year" ADD CONSTRAINT "school_year_closed_by_account_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_teacher_account" ON "class_teacher" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_teacher_un_titulaire" ON "class_teacher" USING btree ("class_id") WHERE "class_teacher"."role" = 'titulaire';--> statement-breakpoint
CREATE INDEX "enrolment_class" ON "enrolment" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "enrolment_pupil" ON "enrolment" USING btree ("pupil_id");--> statement-breakpoint
CREATE INDEX "profile_custodian_profile" ON "profile_custodian" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "profile_custodian_account" ON "profile_custodian" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_custodian_code" ON "profile_custodian" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_custodian_parent_actif" ON "profile_custodian" USING btree ("profile_id","account_id") WHERE "profile_custodian"."status" = 'actif' AND "profile_custodian"."nature" = 'parent';--> statement-breakpoint
CREATE UNIQUE INDEX "profile_custodian_ecole_actif" ON "profile_custodian" USING btree ("profile_id","school_id") WHERE "profile_custodian"."status" = 'actif' AND "profile_custodian"."nature" = 'ecole';--> statement-breakpoint
CREATE INDEX "profile_level_profile" ON "profile_level" USING btree ("profile_id","subject_code");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_level_courant" ON "profile_level" USING btree ("profile_id","subject_code") WHERE "profile_level"."until" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "quran_lemma_key" ON "quran_lemma" USING btree ("lemma_key");--> statement-breakpoint
CREATE UNIQUE INDEX "school_account" ON "school" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "school_member_account" ON "school_member" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "school_year_label" ON "school_year" USING btree ("school_id","label");--> statement-breakpoint
ALTER TABLE "account_role" ADD CONSTRAINT "account_role_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_role" ADD CONSTRAINT "account_role_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_role" ADD CONSTRAINT "account_role_granted_by_account_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkout" ADD CONSTRAINT "billing_checkout_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_group" ADD CONSTRAINT "class_group_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_group" ADD CONSTRAINT "class_group_school_year_id_school_year_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_year"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_group" ADD CONSTRAINT "class_group_subject_code_subject_code_fk" FOREIGN KEY ("subject_code") REFERENCES "public"."subject"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_group" ADD CONSTRAINT "class_group_teacher_account_id_account_id_fk" FOREIGN KEY ("teacher_account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_pupil" ADD CONSTRAINT "class_pupil_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level" ADD CONSTRAINT "level_subject_code_subject_code_fk" FOREIGN KEY ("subject_code") REFERENCES "public"."subject"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_tablet_class_id_class_group_id_fk" FOREIGN KEY ("tablet_class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_tablet_opened_by_account_id_fk" FOREIGN KEY ("tablet_opened_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_group_school" ON "class_group" USING btree ("school_id","school_year_id");--> statement-breakpoint
ALTER TABLE "account_role" ADD CONSTRAINT "account_role_unique" UNIQUE NULLS NOT DISTINCT("account_id","role","school_id","class_id");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_kind_check" CHECK ("account"."kind" IN ('parent', 'adulte', 'admin', 'enseignant', 'ecole'));--> statement-breakpoint
ALTER TABLE "account_role" ADD CONSTRAINT "account_role_role" CHECK ("account_role"."role" IN ('parent', 'eleve_adulte', 'enseignant', 'direction', 'secretariat', 'referent', 'moderateur', 'support', 'admin'));--> statement-breakpoint
ALTER TABLE "class_group" ADD CONSTRAINT "class_group_kind" CHECK ("class_group"."kind" IN ('classe', 'cercle'));--> statement-breakpoint
ALTER TABLE "class_group" ADD CONSTRAINT "class_group_status" CHECK ("class_group"."status" IN ('active', 'archivee'));--> statement-breakpoint
DROP TYPE "public"."account_kind";