CREATE TYPE "public"."retention_purge_error" AS ENUM('blob-delete-failed', 'application-delete-failed', 'sweep-failed');--> statement-breakpoint
CREATE TABLE "retention_purge_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer NOT NULL,
	"leads_deleted" integer DEFAULT 0 NOT NULL,
	"subscribers_deleted" integer DEFAULT 0 NOT NULL,
	"applications_deleted" integer DEFAULT 0 NOT NULL,
	"blobs_deleted" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"error" "retention_purge_error"
);
--> statement-breakpoint
CREATE INDEX "retention_purge_run_created_at_idx" ON "retention_purge_run" USING btree ("created_at");