"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteReport, generateNarrative } from "../../reports/actions";
import { Button } from "../primitives";
import { FormStatus } from "../form-status";
import { NETWORK_ERROR } from "../../../lib/validation/result";

/**
 * The two report controls — build step 13.
 *
 * **Client leaves, component-only, no GSAP** (AGENTS.md 7.5, and the front
 * matter's bundle rule). Both share `ReportAction` below, whose shape is
 * `RecalculateControl`'s: the same `role="status"` result line, the same focus
 * management, the same compact button.
 *
 * **The actions authorise regardless of what renders here.** Hiding or disabling
 * a button is presentation and never enforcement (AGENTS.md 6.2, 11.2 rule 2):
 * each action re-resolves the tenant, re-checks its rate limit and predicates
 * every statement on the organisation before writing anything.
 */

function ReportAction({
  idle,
  busy,
  success,
  run,
  className = "",
}: {
  idle: string;
  busy: string;
  success: string;
  run: () => Promise<{ ok: true } | { ok: false; error: string }>;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function activate() {
    setPending(true);
    setMessage("");
    try {
      const result = await run();
      setMessage(result.ok ? success : result.error);
      /* Refresh on both outcomes: a rejected or failed draft changes the
         report's narrative status, and the page must show that rather than the
         state it rendered with.

         **Kept at prompt 109, which removed ten of these as redundant.** This
         one is not, and `deleteReport` is why: it revalidates `/reports` and
         **not** `/reports/[reportId]`, which is the page this control is
         standing on and the page the report has just stopped existing on.
         Without the refresh the reporter keeps looking at a report that is
         gone — a stale success, which is §8.2 rule 4's failure. It is shared
         with `generateNarrative`, whose own `revalidatePath` *does* cover this
         page, so for that action the call is redundant; one component serves
         both and the deleting one decides. */
      router.refresh();
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={className}>
      <Button
        size="compact"
        bullet={false}
        onClick={activate}
        disabled={pending}
      >
        {pending ? busy : idle}
      </Button>
      <FormStatus
        message={message}
        className="max-w-[34rem]"
        shown="mt-5 block"
      />
    </div>
  );
}

export function GenerateNarrativeControl({
  reportId,
  hasNarrative,
  className = "",
}: {
  reportId: string;
  hasNarrative: boolean;
  className?: string;
}) {
  return (
    <ReportAction
      className={className}
      idle={hasNarrative ? "Redraft narrative" : "Draft narrative"}
      busy="Drafting..."
      success="Draft narrative generated. Review every sentence before using it."
      run={() => generateNarrative(reportId)}
    />
  );
}

export function DeleteReportControl({
  reportId,
  className = "",
}: {
  reportId: string;
  className?: string;
}) {
  return (
    <ReportAction
      className={className}
      idle="Remove report"
      busy="Removing..."
      success="Report removed."
      run={() => deleteReport(reportId)}
    />
  );
}
