import { getCurrentMembership } from "../../../../lib/auth/organization";
import { getReport } from "../../../../lib/db/report-queries";
import { reportSections } from "../../../../lib/domain/reports";
import {
  parseReportEvidence,
  reportIdSchema,
} from "../../../../lib/validation/reports";

/**
 * The deterministic HTML export — build step 13.
 *
 * **A Route Handler, and this is the sanctioned kind.** AGENTS.md 6.2 keeps
 * Route Handlers for callers that are not this application's own forms; the
 * caller here is the browser following a download link, and what it needs back
 * is a document with its own content type and disposition — not a React tree.
 * No mutation happens on this path and no business logic lives in it.
 *
 * **It renders the stored snapshot and nothing else.** No emission is re-summed,
 * no factor re-selected, no target re-projected and no model called. That is the
 * whole contract of an export: the file an auditor receives is the document the
 * reporter reviewed, byte for byte, however long ago it was built.
 *
 * **It authorises before it returns a byte of tenant data.** `proxy.ts`'s
 * redirect is optimistic and is not the enforcement (AGENTS.md 7.3, 11.2
 * rule 1); `getCurrentMembership()` re-reads the membership row from Postgres,
 * and the report read predicates on the organisation it returns. A signed-out
 * caller gets 401, a caller with no membership 403, and **another tenant's
 * report id gets exactly what a nonexistent one gets** — 404, with no existence
 * oracle either way.
 *
 * **No permanent or public URL is minted**, nothing is written to disk or to
 * Blob, and `no-store` keeps a tenant's disclosure out of every shared cache.
 */

/** Escapes into HTML text and double-quoted attribute contexts. Every
    interpolation below goes through it — a report title, a factor set's source
    URL and a generated narrative are all values this route did not author. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A filename safe for a `Content-Disposition` header: ASCII, no quotes, no
    separators. A title is a customer's own text and may contain anything. */
function safeFilename(title: string, periodEnd: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "report";
  return `aetherfield-${slug}-${periodEnd}.html`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;

  const membership = await getCurrentMembership();
  if (!membership) {
    /* Two states, told apart deliberately, and neither says anything about
       another tenant or about whether this report exists. */
    return new Response("Sign in to export a report.", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const parsedId = reportIdSchema.safeParse(reportId);
  if (!parsedId.success) return notFoundResponse();

  const report = await getReport(parsedId.data, membership.organization.id);
  if (!report) return notFoundResponse();

  const evidence = parseReportEvidence(report.evidence);
  if (!evidence) {
    return new Response(
      "This report's stored figures could not be read, so nothing was exported.",
      { status: 422, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const html = renderReport({
    title: report.title,
    organizationName: membership.organization.name,
    generatedAsOf: report.generatedAsOf,
    engineVersion: report.engineVersion,
    formatVersion: report.formatVersion,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    narrative: report.narrative,
    narrativeModel: report.narrativeModel,
    sections: reportSections(evidence),
  });

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${safeFilename(report.title, report.periodEnd)}"`,
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function notFoundResponse() {
  return new Response("That report is not available.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * The document.
 *
 * **Self-contained and dependency-free**: one inline stylesheet, no font
 * request, no script, no image. An exported disclosure is a file that has to
 * open in ten years on a machine with no network, and anything it fetches is a
 * way for it to render differently later — or to phone home from an auditor's
 * desk.
 */
function renderReport(input: {
  title: string;
  organizationName: string;
  generatedAsOf: string;
  engineVersion: string;
  formatVersion: string;
  periodStart: string;
  periodEnd: string;
  narrative: string | null;
  narrativeModel: string | null;
  sections: ReturnType<typeof reportSections>;
}): string {
  const sections = input.sections
    .map((section) => {
      const rows = section.rows
        .map(
          (row) =>
            `<tr><th scope="row">${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`,
        )
        .join("");
      const notes = section.notes
        .map((note) => `<li>${escapeHtml(note)}</li>`)
        .join("");
      return [
        `<section><h2>${escapeHtml(section.title)}</h2>`,
        rows ? `<table><tbody>${rows}</tbody></table>` : "",
        notes ? `<ul class="notes">${notes}</ul>` : "",
        "</section>",
      ].join("");
    })
    .join("");

  const narrative = input.narrative
    ? [
        '<section class="narrative"><h2>Narrative (draft)</h2>',
        `<p class="notes">Drafted by ${escapeHtml(input.narrativeModel ?? "a language model")} over the figures above. Every number in it was checked against this report; it remains a draft for review and nothing has published it.</p>`,
        ...input.narrative
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
          .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
        "</section>",
      ].join("")
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(input.title)} — ${escapeHtml(input.organizationName)}</title>
<style>
:root { color-scheme: light; }
body { margin: 0 auto; max-width: 46rem; padding: 3rem 1.5rem 5rem; background: #fff; color: #111;
  font: 16px/1.6 Georgia, "Times New Roman", serif; }
h1 { font-size: 2rem; line-height: 1.15; margin: 0 0 .5rem; }
h2 { font-size: 1.25rem; margin: 3rem 0 1rem; }
.meta { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: .75rem; color: #555; margin: 0 0 .35rem; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: .5rem 0; border-bottom: 1px solid #ddd; vertical-align: baseline; }
th { font-weight: 400; color: #555; }
td { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
ul.notes { list-style: none; padding: 0; margin: 1.25rem 0 0; }
ul.notes li, p.notes { border-left: 2px solid #111; padding: .15rem 0 .15rem .9rem; margin: 0 0 .75rem;
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: .7rem; line-height: 1.5; }
.narrative p { margin: 0 0 1rem; }
footer { margin-top: 4rem; border-top: 1px solid #ddd; padding-top: 1rem; }
@media print { body { padding: 0; } }
</style>
</head>
<body>
<header>
<p class="meta">${escapeHtml(input.organizationName)} · greenhouse gas report</p>
<h1>${escapeHtml(input.title)}</h1>
<p class="meta">${escapeHtml(input.periodStart)} to ${escapeHtml(input.periodEnd)} · generated ${escapeHtml(input.generatedAsOf)}</p>
<p class="meta">Calculation engine ${escapeHtml(input.engineVersion)} · report format ${escapeHtml(input.formatVersion)}</p>
</header>
${sections}
${narrative}
<footer>
<p class="notes">This document is a snapshot of stored calculations at the generation date above. It is not an assured, verified or audited inventory, and it has not been filed with any authority.</p>
</footer>
</body>
</html>`;
}
