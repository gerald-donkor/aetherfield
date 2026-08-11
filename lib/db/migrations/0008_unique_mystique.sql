CREATE TYPE "public"."projection_basis" AS ENUM('trend', 'flat');--> statement-breakpoint
CREATE TYPE "public"."target_alert_status" AS ENUM('raised', 'notified', 'resolved');--> statement-breakpoint
CREATE TABLE "alert_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"email_alerts" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "target_alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reading_percent" numeric NOT NULL,
	"projected_kg_co2e" numeric NOT NULL,
	"target_kg_co2e" numeric(20, 3) NOT NULL,
	"threshold_percent" numeric(6, 3) NOT NULL,
	"basis" "projection_basis" NOT NULL,
	"complete_months" integer NOT NULL,
	"window_end" text NOT NULL,
	"status" "target_alert_status" DEFAULT 'raised' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "alert_preference" ADD CONSTRAINT "alert_preference_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_preference" ADD CONSTRAINT "alert_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_alert" ADD CONSTRAINT "target_alert_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_alert" ADD CONSTRAINT "target_alert_target_id_emission_target_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."emission_target"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_preference_organization_user_key" ON "alert_preference" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "target_alert_open_key" ON "target_alert" USING btree ("target_id") WHERE "target_alert"."status" <> 'resolved' and "target_alert"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "target_alert_organization_status_idx" ON "target_alert" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "target_alert_organization_created_at_idx" ON "target_alert" USING btree ("organization_id","created_at");