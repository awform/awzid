CREATE TABLE "tutor_budget_alert" (
	"mois" text NOT NULL,
	"seuil" integer NOT NULL,
	"depense_micros" integer NOT NULL,
	"plafond_micros" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_budget_alert_mois_seuil_pk" PRIMARY KEY("mois","seuil")
);
--> statement-breakpoint
CREATE TABLE "tutor_spend" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"profile_id" uuid,
	"secondes" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer NOT NULL,
	"statut" text DEFAULT 'reserve' NOT NULL,
	"fournisseur" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_spend_statut" CHECK ("tutor_spend"."statut" IN ('reserve', 'fait', 'annule')),
	CONSTRAINT "tutor_spend_cost" CHECK ("tutor_spend"."cost_micros" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tutor_spend" ADD CONSTRAINT "tutor_spend_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tutor_spend_at" ON "tutor_spend" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tutor_spend_profile" ON "tutor_spend" USING btree ("profile_id","created_at");