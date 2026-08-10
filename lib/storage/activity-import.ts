import "server-only";

import { del, issueSignedToken, presignUrl, put } from "@vercel/blob";

const IMPORT_READ_TTL_MS = 5 * 60 * 1000;

/**
 * The uploaded CSV's blob write, delete and short-lived read — build step 9.
 *
 * **A copy of `lib/storage/cv.ts`'s shape, not an invention.** Same `put()`
 * with a required `access: 'private'`, same `addRandomSuffix` /
 * `allowOverwrite` left at their `false` defaults (verified in
 * `node_modules/@vercel/blob@2.7.0`'s `dist/index.d.ts`, not recalled), same
 * `issueSignedToken` + `presignUrl` pair for a read URL that is never
 * persisted, same best-effort delete that throws nothing.
 *
 * **`server-only` because it reads `BLOB_READ_WRITE_TOKEN`** — the import makes
 * a mistaken client import a build error rather than a leaked token at runtime
 * (AGENTS.md 6.3, 8.4). The package reads the variable itself; this module
 * never names it, so there is nothing here to echo.
 *
 * **No `console` call anywhere in this file, on any path.** A customer's
 * activity file is their commercial data: its pathname, its filename and every
 * cell in it stay out of every log (AGENTS.md 8.3 rule 2, extended to phase two
 * by 5.3's last bullet). It is also never sent to any third party — no AI
 * provider is involved in this step at all.
 */

/**
 * Stores an uploaded CSV and returns **the blob's pathname**, which is what
 * `activity_import.blob_pathname` holds.
 *
 * `activity-import/<uuid>.csv`, and the shape is deliberate on two counts:
 *
 * - **it is non-guessable**, so the object is unreachable by enumeration even
 *   before `access: 'private'` is considered;
 * - **it carries no tenant identity.** Never the organisation's id, never its
 *   slug, never the uploader, never their filename — a store listing must not
 *   itself be a list of who Aetherfield's customers are. The filename the
 *   customer chose is kept in `activity_import.filename` for display.
 */
export async function putActivityImport(file: File): Promise<string> {
  const pathname = `activity-import/${crypto.randomUUID()}.csv`;

  const blob = await put(pathname, file, {
    access: "private",
    /* Explicit rather than inferred. The action has already decoded the bytes
       as UTF-8 and parsed a header row out of them, so this is the type we know
       it is rather than the type the browser claimed — and browsers claim four
       different things for the same CSV. */
    contentType: "text/csv; charset=utf-8",
  });

  /* The store's own pathname, not the one we composed, so an option changed
     later cannot silently make the stored value differ from the object. */
  return blob.pathname;
}

/**
 * Best-effort delete. **Never throws**, and that is the contract rather than
 * laziness: it runs both in the catch of a failed staging write and on the
 * discard path, and an error thrown here would replace the real outcome with a
 * secondary failure the person cannot act on.
 */
export async function deleteActivityImport(pathname: string): Promise<void> {
  try {
    await del(pathname);
  } catch {
    /* Swallowed deliberately, and silently: there is nothing loggable here
       that is not a customer's data. */
  }
}

/** Mints one exact-path, GET-only private URL and never persists it. */
export async function createActivityImportReadUrl(
  pathname: string,
): Promise<string> {
  const validUntil = Date.now() + IMPORT_READ_TTL_MS;
  const signedToken = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(signedToken, {
    access: "private",
    operation: "get",
    pathname,
    validUntil,
    useCache: false,
  });
  return presignedUrl;
}

/**
 * Cleans the customer's own filename before it is stored for display.
 *
 * The same function `lib/storage/cv.ts` carries, and deliberately a second copy
 * rather than a shared import: the two modules are independent storage paths
 * with independent fallbacks, and one of them changing its rules must not
 * silently change the other's. Falls back to `import.csv` so the column always
 * has something a person can read.
 */
export function sanitiseImportFilename(name: string): string {
  const cleaned = name
    /* Control characters written as escapes rather than literal
       bytes, so the source stays readable and diffable. Path
       separators next: this string is never used as a path, and
       keeping it incapable of looking like one is the cheapest
       guarantee of that. */
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
    .trim();

  return cleaned === "" ? "import.csv" : cleaned;
}
