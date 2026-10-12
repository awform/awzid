-- Hifẓ complet : carte des erreurs (hifz_mark), marques par verset et par mot. Ajout seulement.
-- Retour arrière (manuel) : DROP TABLE "hifz_mark";
CREATE TABLE "hifz_mark" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"day" text NOT NULL,
	"sura" smallint NOT NULL,
	"aya" smallint NOT NULL,
	"word" smallint NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"device_at" timestamp with time zone NOT NULL,
	"server_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hifz_mark_sura" CHECK ("hifz_mark"."sura" BETWEEN 1 AND 114),
	CONSTRAINT "hifz_mark_aya" CHECK ("hifz_mark"."aya" BETWEEN 1 AND 286),
	CONSTRAINT "hifz_mark_word" CHECK ("hifz_mark"."word" BETWEEN -1 AND 300),
	CONSTRAINT "hifz_mark_kind" CHECK ("hifz_mark"."kind" IN ('erreur', 'hesitation', 'oubli', 'juste')),
	CONSTRAINT "hifz_mark_source" CHECK ("hifz_mark"."source" IN ('test', 'auto', 'parent'))
);
--> statement-breakpoint
ALTER TABLE "hifz_mark" ADD CONSTRAINT "hifz_mark_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hifz_mark_profile" ON "hifz_mark" USING btree ("profile_id","sura","aya");