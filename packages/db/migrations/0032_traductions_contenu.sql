-- Lot F1 (revue d'architecture G1) : traduction des CONTENUS prête mais VIDE (les livres restent en français).
--  * content_translation : calque « texte source + traduction versionnée », statut de relecture, validation du
--    référent exigée pour le religieux (règle appliquée par `pickTranslation`) ;
--  * edition.source_locale (« fr ») ; profile.explanation_locale (« fr » par défaut), distinct de account.locale.
-- Retour arrière (manuel) : DROP TABLE content_translation; ALTER TABLE edition DROP COLUMN source_locale;
--   ALTER TABLE profile DROP COLUMN explanation_locale;
CREATE TABLE "content_translation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"object_kind" text NOT NULL,
	"object_id" text NOT NULL,
	"field_path" text NOT NULL,
	"locale" text NOT NULL,
	"version" smallint DEFAULT 1 NOT NULL,
	"source_sha256" text NOT NULL,
	"source_edition_id" uuid,
	"text" text NOT NULL,
	"religious" boolean NOT NULL,
	"status" text DEFAULT 'brouillon' NOT NULL,
	"translator_account_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"validated_by" uuid,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_translation_kind" CHECK ("content_translation"."object_kind" IN ('unite', 'exercice', 'registre', 'niveau', 'livret')),
	CONSTRAINT "content_translation_status" CHECK ("content_translation"."status" IN ('brouillon', 'relue', 'validee', 'rejetee')),
	CONSTRAINT "content_translation_locale" CHECK ("content_translation"."locale" ~ '^[a-z]{2,3}(-[A-Z]{2})?$' AND "content_translation"."locale" <> 'fr'),
	CONSTRAINT "content_translation_validee" CHECK ("content_translation"."status" <> 'validee' OR "content_translation"."validated_at" IS NOT NULL),
	CONSTRAINT "content_translation_text" CHECK (char_length("content_translation"."text") <= 20000)
);
--> statement-breakpoint
ALTER TABLE "edition" ADD COLUMN "source_locale" text DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "explanation_locale" text DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_translation" ADD CONSTRAINT "content_translation_source_edition_id_edition_id_fk" FOREIGN KEY ("source_edition_id") REFERENCES "public"."edition"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_translation" ADD CONSTRAINT "content_translation_translator_account_id_account_id_fk" FOREIGN KEY ("translator_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_translation" ADD CONSTRAINT "content_translation_reviewed_by_account_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_translation" ADD CONSTRAINT "content_translation_validated_by_account_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_translation_version" ON "content_translation" USING btree ("object_kind","object_id","field_path","locale","version");--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_explanation_locale" CHECK ("profile"."explanation_locale" ~ '^[a-z]{2,3}(-[A-Z]{2})?$');