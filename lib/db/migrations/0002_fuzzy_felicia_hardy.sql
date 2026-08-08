ALTER TABLE "subscriber" ADD COLUMN "confirmation_token_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriber" ADD COLUMN "unsubscribe_token" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_unsubscribe_token_key" ON "subscriber" USING btree ("unsubscribe_token");