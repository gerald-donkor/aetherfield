/**
 * Seeds the published DESNZ ("DEFRA") 2026 conversion factors — build step 10.
 *
 *     npm run db:seed:factors
 *
 * **A script, not a route and not an action.** It is run by a developer against
 * the direct connection, has no request path, and takes a committed CSV as its
 * only input. It is written behind `dotenv -e .env.local --` from the day it is
 * added, because nothing but Next.js auto-loads `.env.local` (AGENTS.md 2, 7.3).
 *
 * **It uses `DATABASE_URL_UNPOOLED`**, for the reason `drizzle.config.ts`
 * records: this is a long, session-shaped piece of work, and PgBouncer breaks
 * session state. The application's pooled handle in `lib/db/client.ts` is
 * deliberately not reused.
 *
 * ---
 *
 * ## Idempotence, and why it is not an upsert
 *
 * Keyed on `(source, dataset_version, source_row_id)`. Re-running the script
 * against a set that is already seeded **writes nothing and says so.**
 *
 * **A factor row is never updated in place.** A published set is itself mutable
 * — the 2026 workbook is already at Version 1.2 — and editing a row would stop
 * last year's disclosure reproducing: `activity_emission` stores the
 * `factor_id` it used, so the row it points at has to still mean what it meant
 * when the figure was filed. A revision is therefore a **new set**, inserted
 * alongside, with the old one marked `superseded_by_set_id`. Nothing is
 * destroyed and every historical figure re-derives.
 *
 * ## What is skipped, and why that is not data loss
 *
 * DEFRA publishes 8,740 rows in the 2026 flat file, of which **1,705 carry no
 * factor value** — the hierarchy exists but no number applies to it. Those are
 * skipped rather than stored with a null, because a null-valued factor row is
 * something a mapping could later select, and a mapping that selects nothing is
 * a silent zero in a disclosure. The full sheet stays committed at
 * `lib/db/seed/defra-2026-factors.csv`, so nothing is lost from the record.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, isNull } from "drizzle-orm";
import { Pool } from "pg";

import { emissionFactor, emissionFactorSet } from "../schema";
import { databaseSchema } from "../database-schema";
import { parseCsv } from "../../domain/csv";
import {
  normaliseDefraRow,
  type DefraRow,
  type NormalisedFactor,
} from "../../domain/defra";

/* -------------------------------------------------------------------------- */
/*  The publication this seeds                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Everything about the set, in one place, so a later revision is an edit here
 * and a re-run rather than a code change.
 *
 * `retrievedAt` is when the workbook was downloaded, not when the script runs:
 * it dates the *data*, and re-running the seeder does not make the data newer.
 */
const PUBLICATION = {
  source: "DESNZ",
  datasetVersion: "2026 v1.2",
  publicationYear: 2026,
  /** DEFRA: "The 2026 GHG Conversion Factors are for use with activity data
      that falls entirely or mostly within 2026" (methodology report, 1.10). */
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  licence: "Open Government Licence v3.0",
  licenceUrl:
    "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  sourceUrl:
    "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
  retrievedAt: new Date("2026-08-10T00:00:00Z"),
  /**
   * The recorded per-gas-versus-combined choice.
   *
   * DEFRA ships a combined `kg CO2e` row *and* `kg CO2e of CO2 / CH4 / N2O per
   * unit` siblings for the same activity, and **summing both double-counts**.
   * Both are seeded, because the set is stored as published; the default
   * mappings select the **combined** rows, and that is what this records.
   */
  gasBasis: "combined_co2e",
  notes: [
    "Seeded from the flat-format workbook, converted by scripts/defra-xlsx-to-csv.py.",
    "Rows with no published factor value (1,705 of 8,740) are not seeded.",
    "Every value is already a CO2 equivalent, including the per-gas rows: the",
    "methodology report's paragraph 1.9 states CH4 and N2O are presented as CO2e",
    "on an AR5 basis. gwp_set on these rows is provenance and is never applied.",
    "Hotel stay is listed in both the AR4 and AR5 columns of the methodology",
    "report's Table 1 and is recorded as AR5; the report says it varies by",
    "country and the file carries nothing that resolves it per row.",
  ].join(" "),
} as const;

const SEED_CSV = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "defra-2026-factors.csv",
);

/** The file is 8,740 data rows; the parser takes the ceiling as a parameter and
    the application's own `CSV_MAX_ROWS` is a limit on customer uploads, not on
    a committed reference file. */
const MAX_SEED_ROWS = 20_000;

const INSERT_BATCH = 500;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_UNPOOLED is not set. Pull it with `vercel env pull .env.local`, and run this through `dotenv -e .env.local --`.",
    );
  }

  const started = Date.now();
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema: databaseSchema });

  try {
    /* ---- read and normalise, before touching the database ---- */

    const parsed = parseCsv(readFileSync(SEED_CSV, "utf8"), MAX_SEED_ROWS);
    if (!parsed.ok) throw new Error(`${SEED_CSV}: ${parsed.error}`);

    const columns = parsed.header.map((h) => h.trim());
    const rows: DefraRow[] = parsed.records.map((record) => {
      const row = {} as Record<string, string>;
      columns.forEach((name, i) => {
        row[name] = record.fields[i] ?? "";
      });
      return row as DefraRow;
    });

    const factors: NormalisedFactor[] = [];
    let skippedNoValue = 0;
    const refusals: string[] = [];

    for (const row of rows) {
      const result = normaliseDefraRow(row);
      if (!result.ok) {
        if (row.value.trim() === "") skippedNoValue += 1;
        else refusals.push(`${row.id}: ${result.reason}`);
        continue;
      }
      factors.push(result.factor);
    }

    /* A refusal that is not "no value" means the publisher changed a vocabulary
       — a new unit of measure, a new scope label. Seeding the rest would leave
       a silently incomplete set, so it stops. */
    if (refusals.length > 0) {
      throw new Error(
        `${refusals.length} row(s) could not be normalised; the published vocabulary has changed. First five:\n  ${refusals.slice(0, 5).join("\n  ")}`,
      );
    }

    console.log(
      `read ${rows.length} rows — ${factors.length} to seed, ${skippedNoValue} with no published value`,
    );

    /* ---- idempotence check ---- */

    const [existing] = await db
      .select({ id: emissionFactorSet.id })
      .from(emissionFactorSet)
      .where(
        and(
          isNull(emissionFactorSet.organizationId),
          eq(emissionFactorSet.source, PUBLICATION.source),
          eq(emissionFactorSet.datasetVersion, PUBLICATION.datasetVersion),
        ),
      )
      .limit(1);

    if (existing) {
      console.log(
        `${PUBLICATION.source} ${PUBLICATION.datasetVersion} is already seeded (set ${existing.id}). Nothing written.`,
      );
      console.log(
        "A revision is a new dataset_version, inserted alongside — never an update in place.",
      );
      return;
    }

    /* ---- write ---- */

    await db.transaction(async (tx) => {
      const [set] = await tx
        .insert(emissionFactorSet)
        .values({
          organizationId: null,
          source: PUBLICATION.source,
          datasetVersion: PUBLICATION.datasetVersion,
          publicationYear: PUBLICATION.publicationYear,
          effectiveFrom: PUBLICATION.effectiveFrom,
          effectiveTo: PUBLICATION.effectiveTo,
          licence: PUBLICATION.licence,
          licenceUrl: PUBLICATION.licenceUrl,
          sourceUrl: PUBLICATION.sourceUrl,
          retrievedAt: PUBLICATION.retrievedAt,
          gasBasis: PUBLICATION.gasBasis,
          notes: PUBLICATION.notes,
        })
        .returning({ id: emissionFactorSet.id });

      for (const batch of chunk(factors, INSERT_BATCH)) {
        await tx.insert(emissionFactor).values(
          batch.map((factor) => ({
            setId: set.id,
            organizationId: null,
            sourceRowId: factor.sourceRowId,
            level1: factor.level1,
            level2: factor.level2,
            level3: factor.level3,
            level4: factor.level4,
            columnText: factor.columnText,
            publishedUom: factor.publishedUom,
            publishedGhgUnit: factor.publishedGhgUnit,
            scope: factor.scope,
            scope3Category: factor.scope3Category,
            scope2Method: factor.scope2Method,
            activityUnit: factor.activityUnit,
            resultUnit: factor.resultUnit,
            gas: factor.gas,
            ch4Variant: null,
            gwpSet: factor.gwpSet,
            region: factor.region,
            biogenic: factor.biogenic,
            value: factor.value,
          })),
        );
      }

      console.log(`seeded set ${set.id} with ${factors.length} factors`);
    });

    console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
