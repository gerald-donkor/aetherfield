/**
 * Seeds the published DESNZ ("DEFRA") conversion factors — build step 10, then
 * prompt 69, which turned the single publication into the registry below.
 *
 *     npm run db:seed:factors                 every unseeded publication
 *     npm run db:seed:factors -- "2025 v1.0"  one, selected by dataset_version
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
 * Keyed, per publication, on `(organization_id is null, source,
 * dataset_version)`. Re-running the script against a set that is already seeded
 * **writes nothing and says so**, and an unseeded entry alongside a seeded one
 * writes only itself.
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
 * DEFRA publishes 8,740 rows in each flat file, of which **1,705 (2026) and
 * 1,711 (2025) carry no factor value** — the hierarchy exists but no number
 * applies to it. Those are skipped rather than stored with a null, because a
 * null-valued factor row is something a mapping could later select, and a
 * mapping that selects nothing is a silent zero in a disclosure. Each full
 * sheet stays committed at `lib/db/seed/defra-<year>-factors.csv`, so nothing
 * is lost from the record.
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
/*  The publications this seeds                                                */
/* -------------------------------------------------------------------------- */

type Publication = {
  source: string;
  datasetVersion: string;
  publicationYear: number;
  effectiveFrom: string;
  effectiveTo: string;
  licence: string;
  licenceUrl: string;
  sourceUrl: string;
  retrievedAt: Date;
  gasBasis: NonNullable<typeof emissionFactorSet.$inferInsert.gasBasis>;
  notes: string;
  /** The derived CSV, resolved against this directory. */
  csv: string;
};

const SEED_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Shared by every DESNZ publication and read back from each one's own
    methodology report rather than copied forward — the 2025 report carries the
    same notice, verbatim, in its front matter. */
const OGL = {
  licence: "Open Government Licence v3.0",
  licenceUrl:
    "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  sourceUrl:
    "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
} as const;

/**
 * The recorded per-gas-versus-combined choice, unchanged across both years.
 *
 * DEFRA ships a combined `kg CO2e` row *and* `kg CO2e of CO2 / CH4 / N2O per
 * unit` siblings for the same activity, and **summing both double-counts**.
 * Both are seeded, because the set is stored as published; the default
 * mappings select the **combined** rows, and that is what this records.
 */
const GAS_BASIS = "combined_co2e";

/**
 * Everything about each set, in one place, so a later revision or a further
 * year is an entry here and a re-run rather than a code change.
 *
 * `retrievedAt` is when that workbook was downloaded, not when the script runs:
 * it dates the *data*, and re-running the seeder does not make the data newer.
 *
 * `effectiveFrom` / `effectiveTo` come from each report's own applicability
 * sentence, quoted in the entry — they are not assumed from the year in the
 * title. The paragraph number moves between editions and is quoted with it.
 */
const PUBLICATIONS: readonly Publication[] = [
  {
    source: "DESNZ",
    datasetVersion: "2025 v1",
    publicationYear: 2025,
    /** DEFRA: "The 2025 GHG Conversion Factors are for use with activity data
        that falls entirely or mostly within 2025" (methodology report, 1.8). */
    effectiveFrom: "2025-01-01",
    effectiveTo: "2025-12-31",
    ...OGL,
    retrievedAt: new Date("2026-08-12T00:00:00Z"),
    gasBasis: GAS_BASIS,
    notes: [
      "Seeded from the flat-format workbook (Front page: Status Final, Version 1,",
      "updated 2025-06-10), converted by scripts/defra-xlsx-to-csv.py.",
      "Rows with no published factor value (1,711 of 8,740) are not seeded.",
      "Every value is already a CO2 equivalent, including the per-gas rows: the",
      "methodology report's paragraph 1.7 states CH4 and N2O are presented as CO2e",
      "on an AR5 basis. gwp_set on these rows is provenance and is never applied.",
      "Table 1 of the 2025 report carries the same AR4/AR5 split as the 2026 one,",
      "including Hotel Stay in both columns, which is recorded as AR5 here.",
    ].join(" "),
    csv: path.join(SEED_DIR, "defra-2025-factors.csv"),
  },
  {
    source: "DESNZ",
    datasetVersion: "2026 v1.2",
    publicationYear: 2026,
    /** DEFRA: "The 2026 GHG Conversion Factors are for use with activity data
        that falls entirely or mostly within 2026" (methodology report, 1.10). */
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    ...OGL,
    retrievedAt: new Date("2026-08-10T00:00:00Z"),
    gasBasis: GAS_BASIS,
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
    csv: path.join(SEED_DIR, "defra-2026-factors.csv"),
  },
];

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

type Db = ReturnType<typeof drizzle<typeof databaseSchema>>;

async function seedPublication(db: Db, publication: Publication) {
  const label = `${publication.source} ${publication.datasetVersion}`;

  /* ---- idempotence check, before the file is even read ---- */

  const [existing] = await db
    .select({ id: emissionFactorSet.id })
    .from(emissionFactorSet)
    .where(
      and(
        isNull(emissionFactorSet.organizationId),
        eq(emissionFactorSet.source, publication.source),
        eq(emissionFactorSet.datasetVersion, publication.datasetVersion),
      ),
    )
    .limit(1);

  if (existing) {
    console.log(
      `${label} is already seeded (set ${existing.id}). Nothing written.`,
    );
    return;
  }

  /* ---- read and normalise, before touching the database ---- */

  const parsed = parseCsv(readFileSync(publication.csv, "utf8"), MAX_SEED_ROWS);
  if (!parsed.ok) throw new Error(`${publication.csv}: ${parsed.error}`);

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
     a silently incomplete set, so it stops the whole run: widening the
     vocabulary to make a seed pass is a claim about what a denominator means
     and is not a decision this script may take. */
  if (refusals.length > 0) {
    throw new Error(
      `${label}: ${refusals.length} row(s) could not be normalised; the published vocabulary has changed. First five:\n  ${refusals.slice(0, 5).join("\n  ")}`,
    );
  }

  console.log(
    `${label}: read ${rows.length} rows — ${factors.length} to seed, ${skippedNoValue} with no published value`,
  );

  /* ---- write ---- */

  await db.transaction(async (tx) => {
    const [set] = await tx
      .insert(emissionFactorSet)
      .values({
        organizationId: null,
        source: publication.source,
        datasetVersion: publication.datasetVersion,
        publicationYear: publication.publicationYear,
        effectiveFrom: publication.effectiveFrom,
        effectiveTo: publication.effectiveTo,
        licence: publication.licence,
        licenceUrl: publication.licenceUrl,
        sourceUrl: publication.sourceUrl,
        retrievedAt: publication.retrievedAt,
        gasBasis: publication.gasBasis,
        notes: publication.notes,
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

    console.log(`${label}: seeded set ${set.id} with ${factors.length} factors`);
  });
}

async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_UNPOOLED is not set. Pull it with `vercel env pull .env.local`, and run this through `dotenv -e .env.local --`.",
    );
  }

  /* An optional `dataset_version` selects one entry. Everything unseeded is the
     default, and there is deliberately no second npm script. */
  const selector = process.argv[2];
  const selected = selector
    ? PUBLICATIONS.filter((p) => p.datasetVersion === selector)
    : PUBLICATIONS;

  if (selected.length === 0) {
    throw new Error(
      `no publication with dataset_version ${JSON.stringify(selector)}. Known: ${PUBLICATIONS.map((p) => p.datasetVersion).join(", ")}`,
    );
  }

  const started = Date.now();
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema: databaseSchema });

  try {
    for (const publication of selected) {
      await seedPublication(db, publication);
    }
    console.log(
      "A revision is a new dataset_version, inserted alongside — never an update in place.",
    );
    console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
