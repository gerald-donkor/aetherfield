import "server-only";

import { generateText } from "ai";

import { reportSections } from "../domain/reports";
import {
  NARRATIVE_MAX_CHARS,
  NARRATIVE_MAX_PROMPT_CHARS,
  type ReportEvidence,
} from "../validation/reports";

/**
 * The one place in this codebase a model is reached — build step 13, and the
 * only AI in the product (AGENTS.md 5.3, "sanctioned, not scheduled").
 *
 * **`server-only`.** Nothing here may reach a browser bundle: it reads the
 * gateway's credentials from the environment and it sends a tenant's commercial
 * figures over the network.
 *
 * ---
 *
 * ## What this module may and may not do
 *
 * It drafts **prose over figures that already exist**. It does not calculate,
 * select, round, forecast, interpolate or fill a number, and its output is
 * untrusted until `validateNarrative` has checked every numeric token in it
 * against the snapshot's closed allowlist. That check is in `lib/domain/`, is
 * pure, and runs in the action after this function returns — a draft that fails
 * it is discarded and never stored.
 *
 * The instruction below tells the model the same thing, but **the instruction is
 * not the control.** A system prompt is a request; the allowlist is the
 * enforcement. AGENTS.md 5.3's hard rule survives a model that ignores every
 * word of it.
 *
 * ## What crosses to the provider, and what does not
 *
 * Only the **rendered deterministic sections** — the labels and already-rounded
 * strings a reporter can already see on the page — plus the report's title and
 * period. No raw activity row, no uploaded CSV body, no site name, no personal
 * name, no email address, no session, no identifier of the organisation or the
 * user, and no secret. The prompt is assembled from `reportSections()` output
 * and nothing else, and it is capped at
 * {@link NARRATIVE_MAX_PROMPT_CHARS} characters.
 *
 * A tenant's aggregate emissions figures *are* customer commercial data, and
 * sending them is a recorded decision rather than an incidental one — see
 * `docs/backend.md`, step 13. Nothing here logs any of it.
 *
 * ---
 *
 * ## Provider and authentication
 *
 * Vercel **AI Gateway**, through the AI SDK's `generateText` with a plain
 * `creator/model` string, which is the gateway's own documented default path.
 * Authentication is the project's **OIDC token**: `@ai-sdk/gateway` falls back
 * to `getVercelOidcToken()` when `AI_GATEWAY_API_KEY` is unset, so this step
 * introduces **no new environment variable and no provider API key**. The token
 * is Vercel-managed, is valid for twelve hours locally, and is refreshed with
 * `vercel env pull`.
 *
 * Verified against `node_modules/ai` 7.0.59, `node_modules/@ai-sdk/gateway`
 * 4.0.47, and the Vercel docs on 11 Aug 2026 — sources recorded in
 * `docs/backend.md`, step 13.
 */

/**
 * The drafting model.
 *
 * **Chosen on 11 Aug 2026 from the gateway's live model list**
 * (`https://ai-gateway.vercel.sh/v1/models`, which needs no authentication), not
 * recalled — AGENTS.md 12 rule 7. At that reading it was priced at
 * $1.00 per million input tokens and $5.00 per million output tokens over a
 * 200,000-token context.
 *
 * **The choice is a judgement, not a measurement.** The task is bounded prose
 * over a small, fully-supplied evidence package with a hard instruction not to
 * produce figures — it is constrained writing, not reasoning, and the frontier
 * models cost five times as much for it. The context window is an order of
 * magnitude more than {@link NARRATIVE_MAX_PROMPT_CHARS} needs.
 *
 * A wrong choice here is cheap and reversible: the allowlist rejects a bad draft
 * whatever produced it, so the failure mode of a weaker model is a rejected
 * draft, never a wrong number in a filing.
 */
export const NARRATIVE_MODEL = "anthropic/claude-haiku-4.5";

/** Enough for eight or nine paragraphs. Capped so a runaway generation is a
    bounded cost and a bounded validation pass. A judgement. */
const MAX_OUTPUT_TOKENS = 1200;

/** Low, not zero: the task is constrained and repeatable, and the figures are
    supplied rather than generated. A judgement. */
const TEMPERATURE = 0.2;

/** One attempt, then give up and report a handled failure. A retry storm
    against a paid endpoint is worse than a reporter pressing the button again,
    and the deterministic report is complete without any narrative at all. */
const MAX_RETRIES = 1;

/** A judgement. Long enough for a slow generation, short enough that a Server
    Action does not sit open behind a stalled provider. */
const TIMEOUT_MS = 45_000;

const SYSTEM_PROMPT = [
  "You draft the narrative section of a corporate greenhouse gas disclosure.",
  "",
  "ABSOLUTE RULES:",
  "1. Every number in the report has already been calculated. You must never calculate, estimate, derive, interpolate, round, convert, forecast or invent any number.",
  "2. You may only write a number if it appears verbatim in the REPORT DATA below. Copy it exactly, digit for digit, including decimal places.",
  "3. If a figure you want to mention is not in the REPORT DATA, describe it in words instead, or leave it out.",
  "4. Never state a percentage, a change, a ratio, a total or a year that is not in the REPORT DATA.",
  "5. Never claim the inventory is complete, verified, assured, audited or compliant with any framework.",
  "6. Repeat the stated caveats. If records have no calculated emission, say so plainly.",
  "",
  "REGISTER: measured and operational. Evidence first. Plain UK English, short sentences, active voice.",
  "Never campaigning, never celebratory, never alarmist. No exclamation marks. No marketing language.",
  "",
  "FORMAT: four to six short paragraphs of plain text. No headings, no bullet points, no markdown, no tables.",
  "Cover, in order: the reporting period and what it covers; the emissions profile across the scopes;",
  "coverage and its gaps; target performance if a target is present; and the basis of preparation.",
].join("\n");

export type NarrativeDraft =
  | { ok: true; text: string; model: string }
  | { ok: false; reason: string };

/**
 * Builds the prompt from the deterministic sections a reporter can already see.
 *
 * Deliberately the **same** `reportSections()` the page and the export render,
 * so the model cannot be shown a figure the document does not contain — the
 * prompt is a projection of the disclosure, never a richer view of it.
 */
export function buildNarrativePrompt(
  title: string,
  evidence: ReportEvidence,
): string {
  const lines: string[] = [
    `REPORT TITLE: ${title}`,
    `REPORTING PERIOD: ${evidence.period.startDate} to ${evidence.period.endDate}`,
    "",
    "REPORT DATA — these are the only numbers you may write:",
  ];

  for (const section of reportSections(evidence)) {
    lines.push("", `## ${section.title}`);
    for (const row of section.rows) lines.push(`${row.label}: ${row.value}`);
    for (const note of section.notes) lines.push(`Note: ${note}`);
  }

  lines.push(
    "",
    "Write the narrative now. Use only the numbers above, copied exactly.",
  );

  return lines.join("\n").slice(0, NARRATIVE_MAX_PROMPT_CHARS);
}

/**
 * Asks the gateway for a draft.
 *
 * **Returns a typed refusal and never throws** (AGENTS.md 10 rule 2). A provider
 * outage, a timeout, an expired OIDC token and an empty completion are all
 * ordinary states of this path, and none of them may take down the action that
 * called it — the report's own figures are already stored and are unaffected.
 *
 * The caught error is deliberately not inspected, forwarded or logged: a
 * provider error message can carry the request body, and the request body is a
 * tenant's figures (AGENTS.md 8.3 rule 2).
 */
export async function draftNarrative(
  title: string,
  evidence: ReportEvidence,
): Promise<NarrativeDraft> {
  try {
    const result = await generateText({
      model: NARRATIVE_MODEL,
      system: SYSTEM_PROMPT,
      prompt: buildNarrativePrompt(title, evidence),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      maxRetries: MAX_RETRIES,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = result.text.trim();
    if (text === "") {
      return { ok: false, reason: "The narrative service returned no prose." };
    }
    return {
      ok: true,
      text: text.slice(0, NARRATIVE_MAX_CHARS),
      model: NARRATIVE_MODEL,
    };
  } catch {
    return {
      ok: false,
      reason: "The narrative service could not be reached.",
    };
  }
}
