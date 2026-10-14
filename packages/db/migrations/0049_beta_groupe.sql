-- Lot 6 : groupe « bêta fermée » (rôle `beta_fermee` dans account_role) attribuable par invitation (colonne
-- invitation.groupe). Ajouts seuls : une colonne facultative et une contrainte élargie ; compatible avec la version
-- précédente de l'application (règle « expand / contract »).
-- Retour arrière (manuel) : DELETE FROM "account_role" WHERE "role" = 'beta_fermee'; puis remettre la contrainte
-- d'avant (liste sans 'beta_fermee') et ALTER TABLE "invitation" DROP COLUMN "groupe";
ALTER TABLE "account_role" DROP CONSTRAINT "account_role_role";--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "groupe" text;--> statement-breakpoint
ALTER TABLE "account_role" ADD CONSTRAINT "account_role_role" CHECK ("account_role"."role" IN ('parent', 'eleve_adulte', 'enseignant', 'direction', 'secretariat', 'referent', 'moderateur', 'support', 'admin', 'beta_fermee'));--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_groupe" CHECK ("invitation"."groupe" IS NULL OR "invitation"."groupe" IN ('beta_fermee'));