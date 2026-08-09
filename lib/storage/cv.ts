import "server-only";

import { del, put } from "@vercel/blob";

/**
 * The CV's blob write, and nothing else.
 *
 * **`server-only` because it reads `BLOB_READ_WRITE_TOKEN`** — the import makes
 * a mistaken client import a build error rather than a leaked token at runtime
 * (AGENTS.md 6.3, 8.4). The package reads the variable itself; this module
 * never names it, so there is nothing here to echo.
 *
 * **Only the write.** Minting a short-lived signed read URL is build step 7's
 * job, and an unused reader is speculative work (AGENTS.md 5.2, "do not
 * overbuild"). `deleteCv` is here not as an admin control but as stage e's
 * compensating action: `application.cv_pathname` is `notNull`, so the put must
 * precede the insert, and a failed insert would otherwise leave an orphaned CV
 * in the store.
 *
 * **No `console` call anywhere in this file**, on any path. A CV's pathname,
 * its bytes and its filename are all personal data, and AGENTS.md 8.3 rule 2
 * keeps every one of them out of every log.
 *
 * The API below is read from `node_modules/@vercel/blob@2.7.0`'s
 * `dist/index.d.ts`, not from a tutorial (AGENTS.md 12 rule 2):
 * `put(pathname, body, options)` takes a **required** `access`, and
 * `addRandomSuffix` and `allowOverwrite` both default to `false` in this
 * version — which is not what older docs and older memory say.
 */

/**
 * Stores a CV and returns **the blob's pathname**, which is what
 * `application.cv_pathname` holds and what step 7 will hand to `get()`.
 *
 * The pathname is `cv/<uuid>.pdf` and that shape is deliberate on two counts:
 *
 * - **it is non-guessable**, so the object is not reachable by enumeration even
 *   before `access: 'private'` is considered (AGENTS.md 8.3 rules 4 and 5);
 * - **it carries no personal data.** Never the applicant's name, never their
 *   own filename, never a sequential id — a store listing must not itself be a
 *   list of who applied. The filename they chose is kept in
 *   `application.cv_filename` for display, sanitised by `sanitiseFilename`.
 *
 * `access: 'private'` is the whole point of the module (AGENTS.md 7.3, 8.3
 * rule 4); a public CV is the failure this flow cannot have.
 */
export async function putCv(file: File): Promise<string> {
  const pathname = `cv/${crypto.randomUUID()}.pdf`;

  const blob = await put(pathname, file, {
    access: "private",
    /* Explicit rather than inferred from the extension. The action has already
       proved the bytes begin `%PDF-`, so this is the type we know it is rather
       than the type the browser claimed. */
    contentType: "application/pdf",
    /* `addRandomSuffix` is left at its default of `false` on purpose: a v4 uuid
       is already non-guessable, and a suffix would make the stored pathname
       differ from the string we return — so the value written to the database
       would not be the value the object lives at. `allowOverwrite` likewise
       stays `false`, so a uuid collision fails loudly instead of destroying
       someone else's CV. */
  });

  /* The store's own pathname, not the one we composed, so a divergence can
     never be introduced silently by an option changed later. */
  return blob.pathname;
}

/**
 * Best-effort delete. **Never throws**, and that is the contract rather than
 * laziness: this runs in the catch of a failed insert, and an error thrown here
 * would replace the real failure with a secondary one the user cannot act on.
 * An orphaned blob is a tidiness problem; a masked write error is a bug report
 * nobody can read.
 */
export async function deleteCv(pathname: string): Promise<void> {
  try {
    await del(pathname);
  } catch {
    /* Swallowed deliberately, and silently: see above, and there is nothing
       loggable here that is not personal data. */
  }
}

/**
 * Cleans the applicant's own filename before it is stored for display.
 *
 * It is stored only to be rendered in step 7's submissions view — it is never
 * part of a path, and the blob's pathname is composed independently in `putCv`.
 * Sanitising it anyway is defence in depth: path separators and control
 * characters have no business in a string that will be printed, and an
 * unbounded one is a cheap way to make a row unreadable.
 *
 * Falls back to `cv.pdf` when nothing survives, so the column — which is
 * `notNull` — always has something a person can read.
 */
export function sanitiseFilename(name: string): string {
  const cleaned = name
    /* Control characters first, written as escapes rather than as literal bytes
       so the source stays readable and diffable. */
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    /* Path separators next: this string is never used as a path, and keeping it
       incapable of looking like one is the cheapest guarantee of that. */
    .replace(/[\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
    .trim();

  return cleaned === "" ? "cv.pdf" : cleaned;
}
