-- Lot F1 (revue d'architecture M1) : « Signaler une erreur » sur le contenu, file du référent, errata,
-- suspension d'urgence. account_role : rôle « referent » porté en plus du type de compte (amorce de E2).
-- Retour arrière (manuel) : DROP TABLE content_suspension; DROP TABLE content_report; DROP TABLE account_role;
CREATE TABLE "account_role" (
	"account_id" uuid NOT NULL,
	"role" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_role_account_id_role_pk" PRIMARY KEY("account_id","role"),
	CONSTRAINT "account_role_role" CHECK ("account_role"."role" IN ('referent'))
);
--> statement-breakpoint
CREATE TABLE "content_report" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid,
	"edition_id" uuid,
	"target_kind" text NOT NULL,
	"unit_id" text,
	"path" text DEFAULT '' NOT NULL,
	"ref" text,
	"excerpt" text,
	"fp" text,
	"reason" text NOT NULL,
	"comment" text,
	"status" text DEFAULT 'recu' NOT NULL,
	"decision_note" text,
	"erratum" text,
	"fixed_in_edition" text,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_report_kind" CHECK ("content_report"."target_kind" IN ('verset', 'hadith', 'fiqh', 'lecon', 'exercice')),
	CONSTRAINT "content_report_reason" CHECK ("content_report"."reason" IN ('texte_arabe', 'sens', 'reference', 'regle', 'corrige', 'orthographe', 'autre')),
	CONSTRAINT "content_report_status" CHECK ("content_report"."status" IN ('recu', 'en_examen', 'corrige', 'rejete')),
	CONSTRAINT "content_report_rejet" CHECK ("content_report"."status" <> 'rejete' OR char_length(coalesce("content_report"."decision_note", '')) > 0),
	CONSTRAINT "content_report_lengths" CHECK (char_length(coalesce("content_report"."comment", '')) <= 500 AND char_length(coalesce("content_report"."excerpt", '')) <= 300 AND char_length(coalesce("content_report"."ref", '')) <= 120 AND char_length(coalesce("content_report"."erratum", '')) <= 600 AND char_length(coalesce("content_report"."decision_note", '')) <= 1000)
);
--> statement-breakpoint
CREATE TABLE "content_suspension" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"unit_id" text NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"fp" text,
	"report_id" uuid,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by" uuid,
	CONSTRAINT "content_suspension_reason" CHECK (char_length("content_suspension"."reason") BETWEEN 1 AND 500)
);
--> statement-breakpoint
ALTER TABLE "account_role" ADD CONSTRAINT "account_role_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_edition_id_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."edition"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_handled_by_account_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_suspension" ADD CONSTRAINT "content_suspension_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_suspension" ADD CONSTRAINT "content_suspension_report_id_content_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."content_report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_suspension" ADD CONSTRAINT "content_suspension_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_suspension" ADD CONSTRAINT "content_suspension_lifted_by_account_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_report_status" ON "content_report" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "content_report_account" ON "content_report" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_suspension_active" ON "content_suspension" USING btree ("unit_id","path") WHERE "content_suspension"."lifted_at" IS NULL;