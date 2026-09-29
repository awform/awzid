-- audit PAY-5 : essais « découverte » en double déjà créés par la course — le plus ancien reste
DELETE FROM "subscription" s
WHERE s."plan_code" = 'decouverte' AND EXISTS (
  SELECT 1 FROM "subscription" o
  WHERE o."account_id" = s."account_id" AND o."plan_code" = 'decouverte'
    AND (o."created_at", o."id") < (s."created_at", s."id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_un_essai" ON "subscription" USING btree ("account_id") WHERE "subscription"."plan_code" = 'decouverte';
