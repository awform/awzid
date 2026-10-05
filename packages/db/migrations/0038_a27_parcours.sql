-- Chantier A27 : parcours par niveau et par classe (interface) + décisions D-F2 du chef de projet.
--  1. mots du Coran : sens, racine, verset d'exemple et catégorie tels que donnés par les livres
--     (`mots_coran_1000.json`) ; `quran_lemma_meta` : nombre total de mots du Coran (couverture calculée) ;
--  2. `placement_attempt` : essais du test de positionnement et des épreuves de passage, notés par l'API avec
--     les exercices existants des épreuves de fin de niveau ;
--  3. D-F2 (2) `profile.emancipation_request_at` : demande faite par le jeune, validée par le parent ;
--  4. D-F2 (5) `reenrolment_offer` : proposition de réinscription envoyée à la famille, confirmée d'un geste ;
--  5. D-F2 (8) `message_thread.teacher_account_id` en SET NULL : les fils d'un enseignant qui part restent à
--     l'école (« ancien enseignant »).
-- Retour arrière (manuel) :
--   DROP TABLE "reenrolment_offer"; DROP TABLE "placement_attempt"; DROP TABLE "quran_lemma_meta";
--   ALTER TABLE "quran_lemma" DROP COLUMN "meaning_fr", DROP COLUMN "root", DROP COLUMN "example_ref",
--     DROP COLUMN "category";
--   ALTER TABLE "profile" DROP COLUMN "emancipation_request_at";
--   DELETE FROM "message_thread" WHERE "teacher_account_id" IS NULL;
--   ALTER TABLE "message_thread" DROP CONSTRAINT "message_thread_teacher_account_id_account_id_fk",
--     ALTER COLUMN "teacher_account_id" SET NOT NULL, ADD CONSTRAINT "message_thread_teacher_account_id_account_id_fk"
--     FOREIGN KEY ("teacher_account_id") REFERENCES "account"("id") ON DELETE CASCADE;
CREATE TABLE "placement_attempt" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_code" text NOT NULL,
	"kind" text NOT NULL,
	"level_code" text NOT NULL,
	"points" integer NOT NULL,
	"max" integer NOT NULL,
	"passed" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placement_attempt_kind" CHECK ("placement_attempt"."kind" IN ('positionnement', 'epreuve'))
);
--> statement-breakpoint
CREATE TABLE "quran_lemma_meta" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"total_words" integer NOT NULL,
	"source_sha256" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reenrolment_offer" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"profile_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"school_year_id" uuid,
	"status" text DEFAULT 'proposee' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	CONSTRAINT "reenrolment_offer_status" CHECK ("reenrolment_offer"."status" IN ('proposee', 'acceptee', 'refusee'))
);
--> statement-breakpoint
ALTER TABLE "message_thread" DROP CONSTRAINT "message_thread_teacher_account_id_account_id_fk";
--> statement-breakpoint
ALTER TABLE "message_thread" ALTER COLUMN "teacher_account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "emancipation_request_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quran_lemma" ADD COLUMN "meaning_fr" text;--> statement-breakpoint
ALTER TABLE "quran_lemma" ADD COLUMN "root" text;--> statement-breakpoint
ALTER TABLE "quran_lemma" ADD COLUMN "example_ref" text;--> statement-breakpoint
ALTER TABLE "quran_lemma" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "placement_attempt" ADD CONSTRAINT "placement_attempt_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_attempt" ADD CONSTRAINT "placement_attempt_subject_code_subject_code_fk" FOREIGN KEY ("subject_code") REFERENCES "public"."subject"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_attempt" ADD CONSTRAINT "placement_attempt_level_code_level_code_fk" FOREIGN KEY ("level_code") REFERENCES "public"."level"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reenrolment_offer" ADD CONSTRAINT "reenrolment_offer_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reenrolment_offer" ADD CONSTRAINT "reenrolment_offer_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reenrolment_offer" ADD CONSTRAINT "reenrolment_offer_school_year_id_school_year_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_year"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reenrolment_offer" ADD CONSTRAINT "reenrolment_offer_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reenrolment_offer" ADD CONSTRAINT "reenrolment_offer_decided_by_account_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "placement_attempt_profile" ON "placement_attempt" USING btree ("profile_id","subject_code","at");--> statement-breakpoint
CREATE UNIQUE INDEX "reenrolment_offer_one" ON "reenrolment_offer" USING btree ("profile_id","class_id");--> statement-breakpoint
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_teacher_account_id_account_id_fk" FOREIGN KEY ("teacher_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;