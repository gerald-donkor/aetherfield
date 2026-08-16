"use client";

import { useState } from "react";

import { commitImport, discardImport } from "../../activity/actions";
import { Button } from "../primitives";
import { FormStatus } from "../form-status";
import { NETWORK_ERROR } from "../../../lib/validation/result";

/**
 * Commit and discard — build step 9.
 *
 * **A copy of `app/submissions/action-controls.tsx`'s shape**: the same
 * confirm-then-act pattern, the same focused `role="status"` result line, the
 * same compact buttons. Component-only, no GSAP.
 *
 * **These controls render only while the import is `staged`, and the actions
 * authorise regardless.** Hiding a control is presentation and never
 * enforcement (AGENTS.md 6.2, 11.2 rule 2) — both actions re-resolve the
 * tenant, re-read the import scoped to it and re-check its status before
 * writing anything.
 */

function ResultMessage({ message }: { message: string }) {
  return (
    <FormStatus
      message={message}
      className="max-w-[34rem]"
      shown="mt-5 block"
    />
  );
}

export function ActivityImportControls({
  importId,
  validRowCount,
  className = "",
}: {
  importId: string;
  validRowCount: number;
  className?: string;
}) {
  const [confirming, setConfirming] = useState<"commit" | "discard" | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function run(kind: "commit" | "discard") {
    setPending(true);
    setMessage("");
    try {
      const result =
        kind === "commit"
          ? await commitImport(importId)
          : await discardImport(importId);

      if (result.ok) {
        setMessage(
          kind === "commit"
            ? `${validRowCount.toLocaleString("en-GB")} ${
                validRowCount === 1 ? "row" : "rows"
              } committed to your activity records.`
            : "Import discarded. The uploaded file has been deleted.",
        );
      } else {
        // An honest failure is a visible state (AGENTS.md 8.2 rule 4).
        setMessage(result.error);
      }
      setConfirming(null);
    } catch {
      setMessage(NETWORK_ERROR);
      setConfirming(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={className}>
      {confirming === null ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => {
              setMessage("");
              setConfirming("commit");
            }}
            disabled={validRowCount === 0}
          >
            Commit {validRowCount.toLocaleString("en-GB")}{" "}
            {validRowCount === 1 ? "row" : "rows"}
          </Button>
          <Button
            size="secondary"
            bullet={false}
            onClick={() => {
              setMessage("");
              setConfirming("discard");
            }}
          >
            Discard import
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[12px] leading-[18px]">
            {confirming === "commit"
              ? "Committed rows become part of your activity records and are not editable here."
              : "Discarding deletes the uploaded file and writes no activity records."}
          </span>
          <Button
            size="compact"
            bullet={false}
            onClick={() => run(confirming)}
            disabled={pending}
          >
            {pending
              ? confirming === "commit"
                ? "Committing..."
                : "Discarding..."
              : confirming === "commit"
                ? "Confirm commit"
                : "Confirm discard"}
          </Button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            disabled={pending}
            className="h-[38px] px-3 font-mono text-button font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Cancel
          </button>
        </div>
      )}
      <ResultMessage message={message} />
    </div>
  );
}
