-- Bêta fermée sur invitation : réglages du site (inscription ouverte|invitation, site ouvert|fermé), invitations
-- (code gardé par empreinte seulement), usages, liste d'attente validée à la main. Ajouts seuls (tables neuves),
-- compatibles avec la version précédente de l'application (règle « expand / contract »).
-- Retour arrière (manuel) : DROP TABLE "invitation_use", "waitlist", "invitation", "site_setting";
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code_hash" text NOT NULL,
	"code_end" text NOT NULL,
	"label" text,
	"email" text,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"waitlist_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "invitation_max_uses" CHECK ("invitation"."max_uses" BETWEEN 1 AND 1000),
	CONSTRAINT "invitation_uses" CHECK ("invitation"."uses" >= 0 AND "invitation"."uses" <= "invitation"."max_uses")
);
--> statement-breakpoint
CREATE TABLE "invitation_use" (
	"invitation_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_use_invitation_id_account_id_pk" PRIMARY KEY("invitation_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "site_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"note" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"status" text DEFAULT 'en_attente' NOT NULL,
	"invitation_id" uuid,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email"),
	CONSTRAINT "waitlist_status_check" CHECK ("waitlist"."status" IN ('en_attente', 'acceptee', 'refusee')),
	CONSTRAINT "waitlist_note" CHECK ("waitlist"."note" IS NULL OR char_length("waitlist"."note") <= 500),
	CONSTRAINT "waitlist_name" CHECK ("waitlist"."name" IS NULL OR char_length("waitlist"."name") <= 80)
);
--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_use" ADD CONSTRAINT "invitation_use_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_use" ADD CONSTRAINT "invitation_use_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_setting" ADD CONSTRAINT "site_setting_updated_by_account_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_decided_by_account_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_created" ON "invitation" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "waitlist_status" ON "waitlist" USING btree ("status","created_at");