import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit owns the schema and the migrations exclusively — never a hand-run
 * `ALTER TABLE` against the database (AGENTS.md 9).
 *
 * **`DATABASE_URL_UNPOOLED`, not `DATABASE_URL`.** Migrations need a direct
 * connection: PgBouncer breaks session state, so a migration over the pooled
 * host can fail confusingly or leave a partial apply (AGENTS.md 7.3). The app
 * is the mirror image and uses only the pooled URL.
 *
 * Nothing but Next.js auto-loads `.env.local`, so every `db:*` script in
 * `package.json` runs behind `dotenv -e .env.local --`.
 */
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
  strict: true,
  verbose: true,
});
