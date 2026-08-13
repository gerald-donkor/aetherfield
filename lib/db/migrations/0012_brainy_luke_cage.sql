CREATE TYPE "public"."organization_deletion_status" AS ENUM('pending', 'cancelled', 'purged');--> statement-breakpoint
CREATE TABLE "organization_deletion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"organization_name" text NOT NULL,
	"organization_slug" text NOT NULL,
	"status" "organization_deletion_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_by" text NOT NULL,
	"scheduled_purge_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"purged_at" timestamp with time zone,
	"purge_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "organization_deletion_pending_key" ON "organization_deletion" USING btree ("organization_id") WHERE "organization_deletion"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "organization_deletion_due_idx" ON "organization_deletion" USING btree ("status","scheduled_purge_at");