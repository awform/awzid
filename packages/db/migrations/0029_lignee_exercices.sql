-- Lot F1 (revue d'architecture E5) : progression robuste aux corrections des livres.
--  * exercise_version.position : rang PAR ÉDITION (l'identifiant gelé ne dépend plus de la position) ;
--  * exercise_version.answer_hash / attempt.answer_hash : empreinte du CORRIGÉ, distincte du texte
--    (calculée par l'outil d'import : `backfillContent`, lancé à chaque import, même « inchangé ») ;
--  * exercise_lineage : ancien identifiant → identifiant actuel (gel, remplacement, fusion, scission, retrait).
-- Aucune donnée d'élève n'est modifiée ni perdue : les réponses gardent leur exercice et leur empreinte de texte.
-- Retour arrière (manuel, la convention des migrations est « en avant seulement ») :
--   DROP TABLE exercise_lineage; ALTER TABLE attempt DROP COLUMN answer_hash;
--   ALTER TABLE exercise_version DROP COLUMN answer_hash, DROP COLUMN position;
--   DROP INDEX exercise_unit; CREATE UNIQUE INDEX exercise_unit_position ON exercise (unit_id, position);
CREATE TABLE "exercise_lineage" (
	"from_id" text NOT NULL,
	"to_id" text,
	"kind" text NOT NULL,
	"note" text,
	"edition_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_lineage_from_to" UNIQUE NULLS NOT DISTINCT("from_id","to_id"),
	CONSTRAINT "exercise_lineage_kind" CHECK ("exercise_lineage"."kind" IN ('gel', 'remplace', 'fusion', 'scission', 'retire') AND ("exercise_lineage"."kind" = 'retire') = ("exercise_lineage"."to_id" IS NULL))
);
--> statement-breakpoint
DROP INDEX "exercise_unit_position";--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "answer_hash" text;--> statement-breakpoint
ALTER TABLE "exercise_version" ADD COLUMN "answer_hash" text;--> statement-breakpoint
ALTER TABLE "exercise_version" ADD COLUMN "position" smallint;--> statement-breakpoint
-- jusqu'ici l'ordre des exercices n'a jamais changé d'une édition à l'autre : rang de la table exercise
UPDATE "exercise_version" xv SET "position" = e."position" FROM "exercise" e WHERE e."id" = xv."exercise_id";--> statement-breakpoint
ALTER TABLE "exercise_version" ALTER COLUMN "position" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "exercise_lineage" ADD CONSTRAINT "exercise_lineage_edition_id_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."edition"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_unit" ON "exercise" USING btree ("unit_id","position");
