"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { deleteReport, generateNarrative } from "../../reports/actions";
import { Button } from "../primitives";

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

const NETWORK_ERROR = "We couldn't reach the server. Please try again.";

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
  const resultRef = useRef<HTMLParagraphElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (message) resultRef.current?.focus();
  }, [message]);

  async function activate() {
    setPending(true);
    setMessage("");
    try {
      const result = await run();
      setMessage(result.ok ? success : result.error);
      /* Refresh on both outcomes: a rejected or failed draft changes the
         report's narrative status, and the page must show that rather than the
         state it rendered with. */
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
      <p
        ref={resultRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className={`max-w-[34rem] border-l-2 border-ink pl-4 font-mono text-[12px] leading-[18px] outline-none ${
          message ? "mt-5 block" : "hidden"
        }`}
      >
        {message}
      </p>
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
