CREATE TYPE "public"."activity_category" AS ENUM('electricity', 'fuel', 'heat', 'waste', 'water', 'travel', 'freight', 'other');--> statement-breakpoint
CREATE TYPE "public"."activity_import_row_status" AS ENUM('valid', 'invalid', 'committed');--> statement-breakpoint
CREATE TYPE "public"."activity_import_status" AS ENUM('staged', 'committed', 'discarded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."activity_unit" AS ENUM('kWh', 'MWh', 'L', 'm3', 'kg', 't', 'km', 'tkm');--> statement-breakpoint
CREATE TABLE "activity_import" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"filename" text NOT NULL,
	"blob_pathname" text,
	"status" "activity_import_status" NOT NULL,
	"header_row" text NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"valid_row_count" integer DEFAULT 0 NOT NULL,
	"invalid_row_count" integer DEFAULT 0 NOT NULL,
	"column_mapping" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone,
	"discarded_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "activity_import_row" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"row_number" integer NOT NULL,
	"raw" text NOT NULL,
	"site_name" text,
	"site_normalized_name" text,
	"activity_date" date,
	"category" "activity_category",
	"description" text,
	"quantity" numeric(18, 6),
	"unit" "activity_unit",
	"status" "activity_import_row_status" NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"site_id" uuid NOT NULL,
	"activity_date" date NOT NULL,
	"category" "activity_category" NOT NULL,
	"description" text,
	"quantity" numeric(18, 6) NOT NULL,
	"unit" "activity_unit" NOT NULL,
	"import_id" uuid,
	"import_row_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activity_import" ADD CONSTRAINT "activity_import_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_import" ADD CONSTRAINT "activity_import_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_import_row" ADD CONSTRAINT "activity_import_row_import_id_activity_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."activity_import"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_import_row" ADD CONSTRAINT "activity_import_row_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_record" ADD CONSTRAINT "activity_record_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_record" ADD CONSTRAINT "activity_record_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_record" ADD CONSTRAINT "activity_record_import_id_activity_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."activity_import"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_record" ADD CONSTRAINT "activity_record_import_row_id_activity_import_row_id_fk" FOREIGN KEY ("import_row_id") REFERENCES "public"."activity_import_row"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_import_organization_created_at_idx" ON "activity_import" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_import_row_import_row_number_key" ON "activity_import_row" USING btree ("import_id","row_number");--> statement-breakpoint
CREATE INDEX "activity_import_row_import_status_idx" ON "activity_import_row" USING btree ("import_id","status");--> statement-breakpoint
CREATE INDEX "activity_record_organization_date_idx" ON "activity_record" USING btree ("organization_id","activity_date");--> statement-breakpoint
CREATE INDEX "activity_record_organization_category_idx" ON "activity_record" USING btree ("organization_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "site_organization_normalized_name_key" ON "site" USING btree ("organization_id","normalized_name");