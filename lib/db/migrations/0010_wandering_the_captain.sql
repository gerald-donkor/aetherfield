ALTER TABLE "emission_factor_set" ALTER COLUMN "licence_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "emission_factor_set" ALTER COLUMN "source_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "emission_factor_set" ADD COLUMN "source_reference" text;