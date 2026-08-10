CREATE TYPE "public"."ch4_variant" AS ENUM('combustion', 'fugitive');--> statement-breakpoint
CREATE TYPE "public"."emission_scope" AS ENUM('scope_1', 'scope_2', 'scope_3', 'outside_of_scopes');--> statement-breakpoint
CREATE TYPE "public"."factor_activity_unit" AS ENUM('kwh', 'kwh_net_cv', 'kwh_gross_cv', 'litres', 'cubic_metres', 'million_litres', 'kg', 'tonnes', 'km', 'tonne_km', 'unknown_unit');--> statement-breakpoint
CREATE TYPE "public"."factor_gas_basis" AS ENUM('combined_co2e', 'per_gas');--> statement-breakpoint
CREATE TYPE "public"."factor_result_unit" AS ENUM('kg_co2e', 'kwh');--> statement-breakpoint
CREATE TYPE "public"."ghg_gas" AS ENUM('co2', 'ch4', 'n2o', 'sf6', 'nf3', 'co2e');--> statement-breakpoint
CREATE TYPE "public"."gwp_set" AS ENUM('AR4', 'AR5', 'AR6');--> statement-breakpoint
CREATE TYPE "public"."scope2_method" AS ENUM('location_based', 'market_based');--> statement-breakpoint
CREATE TYPE "public"."scope3_category" AS ENUM('c1_purchased_goods_and_services', 'c2_capital_goods', 'c3_fuel_and_energy_related_activities', 'c4_upstream_transportation_and_distribution', 'c5_waste_generated_in_operations', 'c6_business_travel', 'c7_employee_commuting', 'c8_upstream_leased_assets', 'c9_downstream_transportation_and_distribution', 'c10_processing_of_sold_products', 'c11_use_of_sold_products', 'c12_end_of_life_treatment_of_sold_products', 'c13_downstream_leased_assets', 'c14_franchises', 'c15_investments');--> statement-breakpoint
CREATE TABLE "activity_emission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"activity_record_id" uuid NOT NULL,
	"factor_id" uuid NOT NULL,
	"kg_co2e" numeric(50, 24) NOT NULL,
	"scope" "emission_scope" NOT NULL,
	"scope3_category" "scope3_category",
	"scope2_method" "scope2_method",
	"gwp_set" "gwp_set" NOT NULL,
	"biogenic" boolean NOT NULL,
	"outside_of_scopes" boolean NOT NULL,
	"engine_version" text NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_factor_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"category" "activity_category" NOT NULL,
	"unit" "activity_unit" NOT NULL,
	"factor_id" uuid NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "emission_factor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"organization_id" text,
	"source_row_id" text NOT NULL,
	"level_1" text,
	"level_2" text,
	"level_3" text,
	"level_4" text,
	"column_text" text,
	"published_uom" text NOT NULL,
	"published_ghg_unit" text NOT NULL,
	"scope" "emission_scope" NOT NULL,
	"scope3_category" "scope3_category",
	"scope2_method" "scope2_method",
	"activity_unit" "factor_activity_unit" NOT NULL,
	"result_unit" "factor_result_unit" NOT NULL,
	"gas" "ghg_gas" NOT NULL,
	"ch4_variant" "ch4_variant",
	"gwp_set" "gwp_set" NOT NULL,
	"region" text,
	"biogenic" boolean DEFAULT false NOT NULL,
	"value" numeric(24, 17) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "emission_factor_set" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text,
	"source" text NOT NULL,
	"dataset_version" text NOT NULL,
	"publication_year" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date NOT NULL,
	"licence" text NOT NULL,
	"licence_url" text NOT NULL,
	"source_url" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"gas_basis" "factor_gas_basis" NOT NULL,
	"superseded_by_set_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activity_emission" ADD CONSTRAINT "activity_emission_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_emission" ADD CONSTRAINT "activity_emission_activity_record_id_activity_record_id_fk" FOREIGN KEY ("activity_record_id") REFERENCES "public"."activity_record"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_emission" ADD CONSTRAINT "activity_emission_factor_id_emission_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."emission_factor"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_factor_mapping" ADD CONSTRAINT "activity_factor_mapping_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_factor_mapping" ADD CONSTRAINT "activity_factor_mapping_factor_id_emission_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."emission_factor"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_factor_mapping" ADD CONSTRAINT "activity_factor_mapping_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_factor" ADD CONSTRAINT "emission_factor_set_id_emission_factor_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."emission_factor_set"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_factor" ADD CONSTRAINT "emission_factor_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_factor_set" ADD CONSTRAINT "emission_factor_set_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_factor_set" ADD CONSTRAINT "emission_factor_set_superseded_by_set_id_emission_factor_set_id_fk" FOREIGN KEY ("superseded_by_set_id") REFERENCES "public"."emission_factor_set"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_emission_record_key" ON "activity_emission" USING btree ("activity_record_id");--> statement-breakpoint
CREATE INDEX "activity_emission_organization_scope_idx" ON "activity_emission" USING btree ("organization_id","scope");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_factor_mapping_key" ON "activity_factor_mapping" USING btree ("organization_id","category","unit");--> statement-breakpoint
CREATE INDEX "activity_factor_mapping_factor_idx" ON "activity_factor_mapping" USING btree ("factor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emission_factor_set_row_key" ON "emission_factor" USING btree ("set_id","source_row_id");--> statement-breakpoint
CREATE INDEX "emission_factor_organization_scope_idx" ON "emission_factor" USING btree ("organization_id","scope");--> statement-breakpoint
CREATE INDEX "emission_factor_set_scope_idx" ON "emission_factor" USING btree ("set_id","scope");--> statement-breakpoint
CREATE UNIQUE INDEX "emission_factor_set_published_key" ON "emission_factor_set" USING btree ("source","dataset_version") WHERE "emission_factor_set"."organization_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "emission_factor_set_organization_key" ON "emission_factor_set" USING btree ("organization_id","source","dataset_version") WHERE "emission_factor_set"."organization_id" is not null;--> statement-breakpoint
CREATE INDEX "emission_factor_set_effective_idx" ON "emission_factor_set" USING btree ("effective_from","effective_to");