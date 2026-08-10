CREATE TYPE "public"."target_baseline_source" AS ENUM('stated', 'computed_at_creation');--> statement-breakpoint
CREATE TYPE "public"."target_coverage" AS ENUM('scope_1', 'scope_2', 'scope_3', 'scope_1_2', 'scope_1_2_3');--> statement-breakpoint
CREATE TYPE "public"."target_status" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TABLE "emission_target" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"coverage" "target_coverage" NOT NULL,
	"base_year" integer NOT NULL,
	"target_year" integer NOT NULL,
	"reduction_percent" numeric(6, 3) NOT NULL,
	"baseline_kg_co2e" numeric(20, 3) NOT NULL,
	"baseline_source" "target_baseline_source" NOT NULL,
	"computed_baseline_kg_co2e" numeric(20, 3),
	"status" "target_status" DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "emission_target" ADD CONSTRAINT "emission_target_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_target" ADD CONSTRAINT "emission_target_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emission_target_organization_target_year_idx" ON "emission_target" USING btree ("organization_id","target_year");--> statement-breakpoint
CREATE INDEX "emission_target_organization_created_at_idx" ON "emission_target" USING btree ("organization_id","created_at");