-- audit PAY-1 : doublons déjà créés par la course (démonstrations) — le plus ancien reste, les autres sont
-- expirés et leur référence marquée, pour que l'index unique puisse être créé
UPDATE "subscription" s SET "status" = 'expiree', "provider_ref" = s."provider_ref" || '#doublon-' || s."id"
WHERE s."provider_ref" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "subscription" o
  WHERE o."provider" = s."provider" AND o."provider_ref" = s."provider_ref"
    AND (o."created_at", o."id") < (s."created_at", s."id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_provider_ref" ON "subscription" USING btree ("provider","provider_ref");
