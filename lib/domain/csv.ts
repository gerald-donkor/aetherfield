/**
 * A CSV reader, and the first module of the phase-two domain layer.
 *
 * **`lib/domain/` is what AGENTS.md 6.2 specifies: pure functions over typed
 * inputs, no database handle, no `fetch`, no implicit `Date.now()`.** Step 10's
 * calculation engine lands beside this file and inherits the same rule. Nothing
 * here reads a secret, so there is no `server-only` import; nothing here reads
 * the clock or the environment either, so every call is reproducible from its
 * arguments alone.
 *
 * ---
 *
 * **Why this is hand-written rather than a package**, recorded so it is not
 * re-derived as an oversight:
 *
 * - the parser has to be pure, deterministic and independently testable to sit
 *   in `lib/domain/` at all;
 * - the grammar it must accept is small and fully specified below;
 * - AGENTS.md 12 rule 2 makes an unverified third-party API a cost rather than
 *   a saving, and a dependency added for ~120 lines of state machine is a
 *   surface to verify on every upgrade.
 *
 * No CSV package is installed and none is to be installed for this step.
 *
 * ---
 *
 * ## The accepted grammar, and it is the whole grammar
 *
 * - **UTF-8**, with a leading byte-order mark stripped. A file that does not
 *   decode is a whole-file failure with a legible message, never a mis-parse.
 * - **Comma** is the only delimiter. There is no sniffing: a semicolon-
 *   separated file parses as one column and is reported as such by the mapping
 *   step, which is a legible outcome rather than a silent one.
 * - **`"` quoting**, with `""` for a literal quote inside a quoted field. A
 *   quoted field may contain commas and newlines.
 * - **CRLF or LF** line endings. A lone CR outside a quoted field is a failure:
 *   it is outside the stated grammar, and guessing at it is how a file silently
 *   becomes one enormous row.
 * - **A header row is required**, and it is the first record.
 * - **Blank lines are skipped** wherever they occur, so a trailing newline —
 *   which every spreadsheet writes — is not an empty final row.
 *
 * Anything outside that grammar is a parse failure carrying the line it
 * happened on. Nothing outside it is guessed at.
 */

/** One parsed record, and the physical line its first character sat on. Line
    numbers are 1-based, so they match what a text editor shows; a record
    containing quoted newlines is reported at the line it started. */
export type CsvRecord = {
  line: number;
  fields: string[];
};

export type CsvParseResult =
  | { ok: true; header: string[]; headerLine: number; records: CsvRecord[] }
  | { ok: false; error: string };

const QUOTE = '"';
const DELIMITER = ",";
const BOM = "﻿";

/**
 * Decodes an uploaded file's bytes as UTF-8, or reports that it is not UTF-8.
 *
 * Separate from `parseCsv` because the two failures are different in kind and a
 * person can act on each differently: a file in the wrong encoding needs
 * re-exporting, a file with an unterminated quote needs a cell fixed.
 *
 * `fatal: true` is what makes this a check rather than a lossy conversion —
 * without it a UTF-16 or Latin-1 file decodes into replacement characters and
 * parses "successfully" into nonsense.
 */
export function decodeUtf8(bytes: ArrayBuffer): { ok: true; text: string } | { ok: false; error: string } {
  try {
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return {
      ok: false,
      error:
        "That file is not UTF-8 text. Re-export it as CSV with UTF-8 encoding and try again.",
    };
  }
}

/**
 * Parses CSV text into a header row and its records.
 *
 * @param text the already-decoded file contents.
 * @param maxRecords the ceiling on data records, excluding the header. A file
 * over it fails as a whole rather than being silently truncated — a truncated
 * import is a disclosure built on part of a customer's data, which is the worst
 * kind of quiet failure this flow can have.
 */
export function parseCsv(text: string, maxRecords: number): CsvParseResult {
  const source = text.startsWith(BOM) ? text.slice(BOM.length) : text;

  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let value = "";
  let line = 1;
  let recordLine = 1;
  /** `start` before a field's first character, `plain` inside an unquoted
      field, `quoted` inside a quoted one, `closed` after its closing quote. */
  let state: "start" | "plain" | "quoted" | "closed" = "start";
  let quoteLine = 1;

  function endField() {
    fields.push(value);
    value = "";
    state = "start";
  }

  /** Pushes the record, skipping a blank line — one empty field and nothing
      else, which is what a trailing newline produces. */
  function endRecord() {
    fields.push(value);
    value = "";
    state = "start";
    if (!(fields.length === 1 && fields[0] === "")) {
      records.push({ line: recordLine, fields });
    }
    fields = [];
    recordLine = line + 1;
  }

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (state === "quoted") {
      if (char === QUOTE) {
        if (source[i + 1] === QUOTE) {
          value += QUOTE;
          i += 1;
        } else {
          state = "closed";
        }
        continue;
      }
      if (char === "\n") line += 1;
      value += char;
      continue;
    }

    if (char === QUOTE) {
      if (state !== "start") {
        return {
          ok: false,
          error: `Line ${line}: a quote may only open a field, and a quote inside a quoted field must be doubled. Fix the cell and try again.`,
        };
      }
      state = "quoted";
      quoteLine = line;
      continue;
    }

    if (char === DELIMITER) {
      endField();
      continue;
    }

    if (char === "\r") {
      if (source[i + 1] !== "\n") {
        return {
          ok: false,
          error: `Line ${line}: this file uses carriage-return line endings. Re-export it with CRLF or LF endings and try again.`,
        };
      }
      i += 1;
      endRecord();
      line += 1;
      continue;
    }

    if (char === "\n") {
      endRecord();
      line += 1;
      continue;
    }

    if (state === "closed") {
      return {
        ok: false,
        error: `Line ${line}: there are characters after a closing quote. Fix the cell and try again.`,
      };
    }

    value += char;
    state = "plain";
  }

  if (state === "quoted") {
    return {
      ok: false,
      error: `Line ${quoteLine}: a quoted value is never closed. Add the missing quote and try again.`,
    };
  }
  // The final record when the file does not end in a newline.
  if (fields.length > 0 || value !== "" || state === "closed") endRecord();

  const [header, ...rest] = records;
  if (!header) {
    return {
      ok: false,
      error: "That file has no header row. The first row must name the columns.",
    };
  }
  if (header.fields.every((field) => field.trim() === "")) {
    return {
      ok: false,
      error: "That file's first row is empty. The first row must name the columns.",
    };
  }
  if (rest.length === 0) {
    return {
      ok: false,
      error: "That file has a header row and no data rows.",
    };
  }
  if (rest.length > maxRecords) {
    return {
      ok: false,
      error: `That file has more than ${maxRecords.toLocaleString("en-GB")} data ${maxRecords === 1 ? "row" : "rows"}. Split it and import the parts separately.`,
    };
  }

  return {
    ok: true,
    header: header.fields,
    headerLine: header.line,
    records: rest,
  };
}
