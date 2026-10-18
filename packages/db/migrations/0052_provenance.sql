-- Provenance des demandes et des inscriptions (code court ?src= des affiches, ex. « affiche », « mosquee-xxx ») :
-- une colonne facultative sur la liste d'attente et sur le compte, contrainte au format ^[a-z0-9-]{1,40}$. Ajouts seuls,
-- compatibles avec la version précédente (règle « expand / contract ») ; aucune adresse IP, aucune autre donnée.
-- Retour arrière (manuel) : ALTER TABLE "waitlist" DROP COLUMN "source"; ALTER TABLE "account" DROP COLUMN "source";
ALTER TABLE "account" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_source" CHECK ("account"."source" IS NULL OR "account"."source" ~ '^[a-z0-9-]{1,40}$');--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_source" CHECK ("waitlist"."source" IS NULL OR "waitlist"."source" ~ '^[a-z0-9-]{1,40}$');