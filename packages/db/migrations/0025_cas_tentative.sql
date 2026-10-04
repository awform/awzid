CREATE TABLE "cas_tentative" (
	"profile_id" uuid NOT NULL,
	"unit_id" text NOT NULL,
	"cas" text NOT NULL,
	"texte" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cas_tentative_profile_id_unit_id_cas_pk" PRIMARY KEY("profile_id","unit_id","cas")
);
--> statement-breakpoint
ALTER TABLE "cas_tentative" ADD CONSTRAINT "cas_tentative_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cas_tentative" ADD CONSTRAINT "cas_tentative_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;