-- Chantier A39 « mode serein » (décision du client, 06/10/2026) : l'évaluation ne doit jamais décourager.
--  1. `eval_mode` : mode d'évaluation HISTORISÉ d'un profil (décidé par l'adulte lui-même ou par le parent) ou
--     d'une classe (décidé par l'enseignant ; mode null = choix laissé aux familles) ;
--  2. `profile.eval_mode_wish(_at)` : préférence exprimée par l'ado, validée ou refusée par le parent ;
--  3. `unit_version.facultatif` : rubrique « Pour aller plus loin » (jamais comptée pour le passage ni les épreuves) ;
--  4. `profile_level.source` : + « lecons » (niveau ouvert en mode serein) et « choix » (niveau choisi par l'élève).
-- Retour arrière (manuel) :
--   DROP TABLE "eval_mode";
--   ALTER TABLE "profile" DROP CONSTRAINT "profile_eval_mode_wish", DROP COLUMN "eval_mode_wish", DROP COLUMN "eval_mode_wish_at";
--   ALTER TABLE "unit_version" DROP COLUMN "facultatif";
--   UPDATE "profile_level" SET "source" = 'parent' WHERE "source" IN ('lecons', 'choix');
--   ALTER TABLE "profile_level" DROP CONSTRAINT "profile_level_source", ADD CONSTRAINT "profile_level_source" CHECK ("source" IN
--     ('positionnement', 'epreuve', 'enseignant', 'parent', 'passage', 'reprise', 'inscription'));
CREATE TABLE "eval_mode" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"profile_id" uuid,
	"class_id" uuid,
	"mode" text,
	"decider" text NOT NULL,
	"decided_by" uuid,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	"until" timestamp with time zone,
	CONSTRAINT "eval_mode_mode" CHECK ("eval_mode"."mode" IS NULL OR "eval_mode"."mode" IN ('verification', 'douce', 'serein')),
	CONSTRAINT "eval_mode_decider" CHECK ("eval_mode"."decider" IN ('soi', 'parent', 'enseignant')),
	CONSTRAINT "eval_mode_portee" CHECK (("eval_mode"."profile_id" IS NOT NULL AND "eval_mode"."class_id" IS NULL AND "eval_mode"."mode" IS NOT NULL) OR ("eval_mode"."profile_id" IS NULL AND "eval_mode"."class_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "profile_level" DROP CONSTRAINT "profile_level_source";--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "eval_mode_wish" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "eval_mode_wish_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "unit_version" ADD COLUMN "facultatif" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_mode" ADD CONSTRAINT "eval_mode_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_mode" ADD CONSTRAINT "eval_mode_class_id_class_group_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_mode" ADD CONSTRAINT "eval_mode_decided_by_account_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_mode_profile" ON "eval_mode" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "eval_mode_class" ON "eval_mode" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_mode_profile_courant" ON "eval_mode" USING btree ("profile_id") WHERE "eval_mode"."until" IS NULL AND "eval_mode"."profile_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_mode_class_courant" ON "eval_mode" USING btree ("class_id") WHERE "eval_mode"."until" IS NULL AND "eval_mode"."class_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_eval_mode_wish" CHECK ("profile"."eval_mode_wish" IS NULL OR "profile"."eval_mode_wish" IN ('verification', 'douce', 'serein'));--> statement-breakpoint
ALTER TABLE "profile_level" ADD CONSTRAINT "profile_level_source" CHECK ("profile_level"."source" IN ('positionnement', 'epreuve', 'enseignant', 'parent', 'passage', 'reprise', 'inscription', 'lecons', 'choix'));