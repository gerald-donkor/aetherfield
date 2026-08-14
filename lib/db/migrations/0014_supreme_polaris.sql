CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
ALTER TABLE "emission_factor_embedding" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "emission_factor_embedding" CASCADE;--> statement-breakpoint
CREATE INDEX "emission_factor_label_trgm_idx" ON "emission_factor" USING gin ((coalesce(nullif("level_2", ''), '') || case when nullif("level_2", '') is not null and (nullif("level_3", '') is not null or nullif("column_text", '') is not null) then ' · ' else '' end || coalesce(nullif("level_3", ''), '') || case when nullif("level_3", '') is not null and nullif("column_text", '') is not null then ' · ' else '' end || coalesce(nullif("column_text", ''), '')) gin_trgm_ops);
