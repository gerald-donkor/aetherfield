CREATE TYPE "public"."lead_source" AS ENUM('hero', 'nav', 'cta_band');--> statement-breakpoint
CREATE TYPE "public"."subscriber_status" AS ENUM('pending', 'confirmed', 'unsubscribed');--> statement-breakpoint
CREATE TABLE "application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_slug" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"message" text,
	"cv_pathname" text NOT NULL,
	"cv_filename" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "application_email_lowercase" CHECK ("application"."email" = lower("application"."email"))
);
--> statement-breakpoint
CREATE TABLE "lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text NOT NULL,
	"message" text,
	"source" "lead_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "lead_email_lowercase" CHECK ("lead"."email" = lower("lead"."email"))
);
--> statement-breakpoint
CREATE TABLE "subscriber" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"status" "subscriber_status" DEFAULT 'pending' NOT NULL,
	"confirmation_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "subscriber_email_lowercase" CHECK ("subscriber"."email" = lower("subscriber"."email"))
);
--> statement-breakpoint
CREATE INDEX "application_job_slug_idx" ON "application" USING btree ("job_slug");--> statement-breakpoint
CREATE INDEX "application_created_at_idx" ON "application" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lead_created_at_idx" ON "lead" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_email_key" ON "subscriber" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_confirmation_token_key" ON "subscriber" USING btree ("confirmation_token");