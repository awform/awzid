CREATE TYPE "public"."account_kind" AS ENUM('parent', 'adulte', 'admin');--> statement-breakpoint
CREATE TYPE "public"."edition_status" AS ENUM('brouillon', 'publiee', 'retiree');--> statement-breakpoint
CREATE TYPE "public"."profile_kind" AS ENUM('enfant', 'ado', 'adulte');--> statement-breakpoint
CREATE TYPE "public"."progress_status" AS ENUM('ouverte', 'commencee', 'terminee', 'maitrisee');--> statement-breakpoint
CREATE TYPE "public"."registry_kind" AS ENUM('coran', 'hadith', 'fiqh', 'invocation');--> statement-breakpoint
CREATE TYPE "public"."unit_kind" AS ENUM('lecon', 'bilan', 'examen');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" "account_kind" NOT NULL,
	"email" text,
	"password_hash" text,
	"country" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"totp_secret_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attempt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"unit_id" text NOT NULL,
	"exercise_id" text,
	"exercise_hash" text,
	"item_index" smallint,
	"event_type" text NOT NULL,
	"response" jsonb,
	"correct" integer,
	"total" integer,
	"score" real,
	"try_number" smallint,
	"device_at" timestamp with time zone NOT NULL,
	"server_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_account_id" uuid,
	"action" text NOT NULL,
	"target" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"type" text NOT NULL,
	"text_version" text NOT NULL,
	"given_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "edition" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"status" "edition_status" DEFAULT 'brouillon' NOT NULL,
	"source_sha256" text NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "edition_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "exercise" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"position" smallint NOT NULL,
	"type" text NOT NULL,
	"graded" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_version" (
	"edition_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"hash" text NOT NULL,
	"item_count" smallint NOT NULL,
	"content" jsonb NOT NULL,
	CONSTRAINT "exercise_version_edition_id_exercise_id_pk" PRIMARY KEY("edition_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "guardianship" (
	"parent_account_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "guardianship_parent_account_id_profile_id_pk" PRIMARY KEY("parent_account_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "hifz_book" (
	"edition_id" uuid NOT NULL,
	"code" text NOT NULL,
	"content" jsonb NOT NULL,
	CONSTRAINT "hifz_book_edition_id_code_pk" PRIMARY KEY("edition_id","code")
);
--> statement-breakpoint
CREATE TABLE "level" (
	"code" text PRIMARY KEY NOT NULL,
	"track" text NOT NULL,
	"rank" smallint NOT NULL,
	"title_fr" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level_version" (
	"edition_id" uuid NOT NULL,
	"level_code" text NOT NULL,
	"book" jsonb NOT NULL,
	CONSTRAINT "level_version_edition_id_level_code_pk" PRIMARY KEY("edition_id","level_code")
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"kind" "profile_kind" NOT NULL,
	"pseudonym" text NOT NULL,
	"birth_year" smallint,
	"avatar" text,
	"level_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_birth_year" CHECK ("profile"."birth_year" IS NULL OR "profile"."birth_year" BETWEEN 1900 AND 2100)
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"profile_id" uuid NOT NULL,
	"unit_id" text NOT NULL,
	"status" "progress_status" NOT NULL,
	"score" real,
	"best_score" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_profile_id_unit_id_pk" PRIMARY KEY("profile_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "qr_redirect" (
	"slug" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quran_verse" (
	"sura" smallint NOT NULL,
	"aya" smallint NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "quran_verse_sura_aya_pk" PRIMARY KEY("sura","aya")
);
--> statement-breakpoint
CREATE TABLE "registry_entry" (
	"edition_id" uuid NOT NULL,
	"kind" "registry_kind" NOT NULL,
	"id" text NOT NULL,
	"statut" text,
	"validation_humaine" boolean DEFAULT false NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "registry_entry_edition_id_kind_id_pk" PRIMARY KEY("edition_id","kind","id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"id" text PRIMARY KEY NOT NULL,
	"level_code" text NOT NULL,
	"n" smallint NOT NULL,
	"kind" "unit_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_version" (
	"edition_id" uuid NOT NULL,
	"unit_id" text NOT NULL,
	"num_lecon" smallint,
	"num_bilan" smallint,
	"title_ar" text NOT NULL,
	"title_fr" text NOT NULL,
	"sha256" text NOT NULL,
	"strict_json" boolean NOT NULL,
	"content" jsonb NOT NULL,
	"student" jsonb NOT NULL,
	CONSTRAINT "unit_version_edition_id_unit_id_pk" PRIMARY KEY("edition_id","unit_id")
);
--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_edition_id_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."edition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_account_id_account_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_version" ADD CONSTRAINT "exercise_version_edition_id_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_version" ADD CONSTRAINT "exercise_version_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardianship" ADD CONSTRAINT "guardianship_parent_account_id_account_id_fk" FOREIGN KEY ("parent_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardianship" ADD CONSTRAINT "guardianship_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hifz_book" ADD CONSTRAINT "hifz_book_edition_id_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_version" ADD CONSTRAINT "level_version_edition_id_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_version" ADD CONSTRAINT "level_version_level_code_level_code_fk" FOREIGN KEY ("level_code") REFERENCES "public"."level"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_owner_account_id_account_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_level_code_level_code_fk" FOREIGN KEY ("level_code") REFERENCES "public"."level"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_redirect" ADD CONSTRAINT "qr_redirect_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_entry" ADD CONSTRAINT "registry_entry_edition_id_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit" ADD CONSTRAINT "unit_level_code_level_code_fk" FOREIGN KEY ("level_code") REFERENCES "public"."level"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_version" ADD CONSTRAINT "unit_version_edition_id_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_version" ADD CONSTRAINT "unit_version_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_email" ON "account" USING btree ("email");--> statement-breakpoint
CREATE INDEX "attempt_profile_unit" ON "attempt" USING btree ("profile_id","unit_id");--> statement-breakpoint
CREATE INDEX "attempt_exercise" ON "attempt" USING btree ("exercise_id","exercise_hash");--> statement-breakpoint
CREATE INDEX "audit_log_at" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_unit_position" ON "exercise" USING btree ("unit_id","position");--> statement-breakpoint
CREATE INDEX "exercise_version_hash" ON "exercise_version" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "profile_owner" ON "profile" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "registry_statut" ON "registry_entry" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "session_account" ON "session" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_level_n" ON "unit" USING btree ("level_code","n");