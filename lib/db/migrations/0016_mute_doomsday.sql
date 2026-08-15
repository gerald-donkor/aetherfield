DROP INDEX "activity_factor_mapping_key";--> statement-breakpoint
DROP INDEX "activity_emission_record_key";--> statement-breakpoint
ALTER TABLE "activity_factor_mapping" ADD COLUMN "scope2_method" "scope2_method";--> statement-breakpoint
CREATE UNIQUE INDEX "activity_emission_record_market_key" ON "activity_emission" USING btree ("activity_record_id") WHERE "activity_emission"."scope2_method" = 'market_based';--> statement-breakpoint
CREATE UNIQUE INDEX "activity_factor_mapping_default_key" ON "activity_factor_mapping" USING btree ("organization_id","category","unit") WHERE "activity_factor_mapping"."scope2_method" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_factor_mapping_method_key" ON "activity_factor_mapping" USING btree ("organization_id","category","unit","scope2_method") WHERE "activity_factor_mapping"."scope2_method" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_emission_record_key" ON "activity_emission" USING btree ("activity_record_id") WHERE "activity_emission"."scope2_method" is distinct from 'market_based';