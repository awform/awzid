CREATE TABLE "billing_checkout" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"plan_code" text NOT NULL,
	"zone" text NOT NULL,
	"currency" text NOT NULL,
	"amount" integer NOT NULL,
	"seats" integer,
	"provider" text NOT NULL,
	"provider_ref" text,
	"status" text DEFAULT 'ouverte' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "billing_checkout_status" CHECK ("billing_checkout"."status" IN ('ouverte', 'payee', 'echouee', 'expiree'))
);
--> statement-breakpoint
CREATE TABLE "billing_event" (
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"checkout_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_event_provider_event_id_pk" PRIMARY KEY("provider","event_id")
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"plan_code" text NOT NULL,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"seats" integer,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_status" CHECK ("subscription"."status" IN ('essai', 'active', 'annulee', 'expiree', 'impayee'))
);
--> statement-breakpoint
ALTER TABLE "billing_checkout" ADD CONSTRAINT "billing_checkout_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_checkout_account" ON "billing_checkout" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "subscription_account" ON "subscription" USING btree ("account_id");