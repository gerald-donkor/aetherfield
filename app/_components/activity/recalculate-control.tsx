"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { recalculate } from "../../activity/actions";
import { Button } from "../primitives";
import { FormStatus } from "../form-status";
import { NETWORK_ERROR } from "../../../lib/validation/result";

/**
 * The recalculate control — build step 10.
 *
 * **A client leaf, component-only, no GSAP** (AGENTS.md 7.5, and the front
 * matter's bundle rule). Its shape is `ActivityImportControls`', deliberately:
 * the same `role="status"` result line, the same focus management, the same
 * compact button — so the two controls in this area behave identically.
 *
 * **The action authorises regardless of what renders here.** Hiding or
 * disabling a button is presentation and never enforcement (AGENTS.md 6.2,
 * 11.2 rule 2): `recalculate` re-resolves the tenant, re-checks the rate limit
 * and predicates every query on the organisation before writing anything.
 */

export function RecalculateControl({
  importId = null,
  className = "",
}: {
  /** `null` recalculates the whole organisation; an id scopes it to one
      import. Either way the server re-derives the tenant and treats a
      cross-tenant id as not-found. */
  importId?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    setPending(true);
    setMessage("");
    try {
      const result = await recalculate(importId);
      if (result.ok) {
        setMessage(
          importId
            ? "Emissions recalculated for this import."
            : "Emissions recalculated across your activity records.",
        );
        router.refresh();
      } else {
        // An honest failure is a visible state (AGENTS.md 8.2 rule 4).
        setMessage(result.error);
      }
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={className}>
      <Button size="compact" bullet={false} onClick={run} disabled={pending}>
        {pending ? "Calculating..." : "Recalculate emissions"}
      </Button>
      <FormStatus
        message={message}
        className="max-w-[34rem]"
        shown="mt-5 block"
      />
    </div>
  );
}
