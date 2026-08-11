CREATE TYPE "public"."report_narrative_status" AS ENUM('not_generated', 'generated', 'rejected', 'failed');--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text,
	"title" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"generated_as_of" date NOT NULL,
	"evidence" text NOT NULL,
	"engine_version" text NOT NULL,
	"format_version" text NOT NULL,
	"narrative_status" "report_narrative_status" DEFAULT 'not_generated' NOT NULL,
	"narrative" text,
	"narrative_model" text,
	"narrative_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"narrative_generated_at" timestamp with time zone,
	"narrative_attempted_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_organization_created_at_idx" ON "report" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "report_organization_id_idx" ON "report" USING btree ("organization_id","id");