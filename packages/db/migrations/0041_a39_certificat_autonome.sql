-- A39 (décision D-A39 4) : certificat individuel de l'adulte autonome (« Awzid — parcours autonome »), sans classe
-- ni registre d'école : `certificate.profile_id`.
-- Retour arrière (manuel) : ALTER TABLE "certificate" DROP COLUMN "profile_id";
ALTER TABLE "certificate" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "certificate_profile" ON "certificate" USING btree ("profile_id");