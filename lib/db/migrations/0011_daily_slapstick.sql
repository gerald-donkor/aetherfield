ALTER TABLE "emission_factor" ADD COLUMN "supersedes_source" text;--> statement-breakpoint
ALTER TABLE "emission_factor" ADD COLUMN "supersedes_source_row_id" text;--> statement-breakpoint
CREATE INDEX "emission_factor_supersedes_idx" ON "emission_factor" USING btree ("supersedes_source","supersedes_source_row_id");--> statement-breakpoint
ALTER TABLE "emission_factor" ADD CONSTRAINT "emission_factor_supersedes_pair" CHECK (("emission_factor"."supersedes_source" is null) = ("emission_factor"."supersedes_source_row_id" is null));--> statement-breakpoint
ALTER TABLE "emission_factor" ADD CONSTRAINT "emission_factor_supersedes_tenant_only" CHECK ("emission_factor"."organization_id" is not null or "emission_factor"."supersedes_source" is null);