CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "emission_factor_embedding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factor_id" uuid NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"source_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emission_factor_embedding" ADD CONSTRAINT "emission_factor_embedding_factor_id_emission_factor_id_fk" FOREIGN KEY ("factor_id") REFERENCES "public"."emission_factor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "emission_factor_embedding_factor_model_key" ON "emission_factor_embedding" USING btree ("factor_id","model");--> statement-breakpoint
CREATE INDEX "emission_factor_embedding_hnsw_idx" ON "emission_factor_embedding" USING hnsw ("embedding" vector_cosine_ops);
