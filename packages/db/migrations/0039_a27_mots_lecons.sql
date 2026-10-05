-- A27 (décision D-A27 3) : lien mot du Coran <-> leçon du livre, par filière (exporté par les livres ; vide sinon).
-- Retour arrière (manuel) : ALTER TABLE "quran_lemma" DROP COLUMN "unit_enfants", DROP COLUMN "unit_adultes", DROP COLUMN "unit_ados";
ALTER TABLE "quran_lemma" ADD COLUMN "unit_enfants" text;--> statement-breakpoint
ALTER TABLE "quran_lemma" ADD COLUMN "unit_adultes" text;--> statement-breakpoint
ALTER TABLE "quran_lemma" ADD COLUMN "unit_ados" text;--> statement-breakpoint
ALTER TABLE "quran_lemma" ADD CONSTRAINT "quran_lemma_unit_enfants_unit_id_fk" FOREIGN KEY ("unit_enfants") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quran_lemma" ADD CONSTRAINT "quran_lemma_unit_adultes_unit_id_fk" FOREIGN KEY ("unit_adultes") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quran_lemma" ADD CONSTRAINT "quran_lemma_unit_ados_unit_id_fk" FOREIGN KEY ("unit_ados") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;
