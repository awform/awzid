-- Retour arrière manuel : DROP TABLE hifz_classe_erreur; DROP TABLE hifz_classe_seance; ALTER TABLE hifz_mark DROP CONSTRAINT hifz_mark_source; ALTER TABLE hifz_mark ADD CONSTRAINT hifz_mark_source CHECK (source IN ('test', 'auto', 'parent')); (supprimer d abord les marques de source enseignant)
CREATE TABLE "hifz_classe_erreur" (
	"seance_id" uuid NOT NULL,
	"aya" smallint NOT NULL,
	"word" smallint NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "hifz_classe_erreur_seance_id_aya_word_kind_pk" PRIMARY KEY("seance_id","aya","word","kind"),
	CONSTRAINT "hifz_classe_erreur_kind" CHECK ("hifz_classe_erreur"."kind" IN ('oubli', 'ajout', 'changement', 'tajwid')),
	CONSTRAINT "hifz_classe_erreur_pos" CHECK ("hifz_classe_erreur"."aya" BETWEEN 1 AND 286 AND "hifz_classe_erreur"."word" BETWEEN 0 AND 300)
);
--> statement-breakpoint
CREATE TABLE "hifz_classe_seance" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"class_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"teacher_account_id" uuid,
	"mode" text NOT NULL,
	"sura" smallint NOT NULL,
	"from_aya" smallint NOT NULL,
	"to_aya" smallint NOT NULL,
	"recitation_id" uuid,
	"status" text DEFAULT 'en_cours' NOT NULL,
	"outcome" text,
	"remark" text,
	"event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "hifz_classe_seance_mode" CHECK ("hifz_classe_seance"."mode" IN ('direct', 'enregistrement')),
	CONSTRAINT "hifz_classe_seance_status" CHECK ("hifz_classe_seance"."status" IN ('en_cours', 'terminee')),
	CONSTRAINT "hifz_classe_seance_outcome" CHECK ("hifz_classe_seance"."outcome" IS NULL OR "hifz_classe_seance"."outcome" IN ('validee', 'a_reprendre')),
	CONSTRAINT "hifz_classe_seance_sura" CHECK ("hifz_classe_seance"."sura" BETWEEN 1 AND 114),
	CONSTRAINT "hifz_classe_seance_aya" CHECK ("hifz_classe_seance"."from_aya" BETWEEN 1 AND "hifz_classe_seance"."to_aya" AND "hifz_classe_seance"."to_aya" <= 286),
	CONSTRAINT "hifz_classe_seance_remark" CHECK ("hifz_classe_seance"."remark" IS NULL OR char_length("hifz_classe_seance"."remark") <= 300),
	CONSTRAINT "hifz_classe_seance_direct" CHECK ("hifz_classe_seance"."mode" <> 'direct' OR "hifz_classe_seance"."recitation_id" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "hifz_mark" DROP CONSTRAINT "hifz_mark_source";--> statement-breakpoint
ALTER TABLE "hifz_classe_erreur" ADD CONSTRAINT "hifz_classe_erreur_seance_id_hifz_classe_seance_id_fk" FOREIGN KEY ("seance_id") REFERENCES "public"."hifz_classe_seance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hifz_classe_seance" ADD CONSTRAINT "hifz_classe_seance_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hifz_classe_seance" ADD CONSTRAINT "hifz_classe_seance_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hifz_classe_seance" ADD CONSTRAINT "hifz_classe_seance_teacher_account_id_account_id_fk" FOREIGN KEY ("teacher_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hifz_classe_seance" ADD CONSTRAINT "hifz_classe_seance_recitation_id_recitation_upload_id_fk" FOREIGN KEY ("recitation_id") REFERENCES "public"."recitation_upload"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hifz_classe_seance_class" ON "hifz_classe_seance" USING btree ("class_id","created_at");--> statement-breakpoint
CREATE INDEX "hifz_classe_seance_profile" ON "hifz_classe_seance" USING btree ("profile_id","created_at");--> statement-breakpoint
ALTER TABLE "hifz_mark" ADD CONSTRAINT "hifz_mark_source" CHECK ("hifz_mark"."source" IN ('test', 'auto', 'parent', 'enseignant'));