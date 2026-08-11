"use client";

import { useEffect, useRef, useState } from "react";

import { setAlertEmailPreference } from "../../account/actions";
import { Button } from "../primitives";

/**
 * The alert-email off switch on `/account` — build step 14.
 *
 * **A client leaf, component-only, no GSAP** (AGENTS.md 7.5, and the front
 * matter's bundle rule). Its shape is `RecalculateControl`'s, deliberately: the
 * same `role="status"` result line, the same focus management, the same compact
 * button — so the controls in this product behave identically.
 *
 * **Built from the existing primitives.** No new primitive and no second design
 * system: a `Button` and the site's own type scale, sitting in the page's own
 * rhythm rather than as a bolted-on form.
 *
 * **The action authorises regardless of what renders here.** Hiding or
 * disabling a control is presentation and never enforcement (AGENTS.md 6.2,
 * 11.2 rule 2): `setAlertEmailPreference` re-resolves the tenant, re-checks the
 * rate limit and writes only the calling account's own row. The nightly sweep
 * re-reads the stored preference on its own, in SQL.
 */

const NETWORK_ERROR = "We couldn't reach the server. Please try again.";

export function AlertPreferenceControl({
  emailAlerts,
  className = "",
}: {
  /** The stored preference, read server-side. A missing row means opted in. */
  emailAlerts: boolean;
  className?: string;
}) {
  const [enabled, setEnabled] = useState(emailAlerts);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const resultRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (message) resultRef.current?.focus();
  }, [message]);

  async function toggle() {
    const next = !enabled;
    setPending(true);
    setMessage("");
    try {
      const result = await setAlertEmailPreference({ emailAlerts: next });
      if (result.ok) {
        setEnabled(next);
        setMessage(
          next
            ? "Alert email is on. You'll be told when a target's projection drifts past the threshold."
            : "Alert email is off. Targets are still tracked, and the workspace still shows the reading.",
        );
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
      <p className="max-w-[680px] font-serif text-p2 text-muted">
        {enabled
          ? "Alert email is on. Aetherfield emails this organisation's owners when a target's projected figure drifts past the alert threshold."
          : "Alert email is off. Targets are still tracked and recalculated nightly; no message is sent to you."}
      </p>
      <Button
        size="compact"
        bullet={false}
        onClick={toggle}
        disabled={pending}
        className="mt-6"
      >
        {pending
          ? "Saving..."
          : enabled
            ? "Turn off alert email"
            : "Turn on alert email"}
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
