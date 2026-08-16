"use client";

import { useEffect, useRef, useState } from "react";

import { respondToInvitation } from "../../invitation/[id]/actions";
import { Button } from "../primitives";
import { FormStatus } from "../form-status";
import { NETWORK_ERROR } from "../../../lib/validation/result";

/**
 * Accept or decline an invitation — prompt 63's client leaf on
 * `/invitation/[id]`.
 *
 * **Component-only**, like every other client leaf: no constant and no type is
 * exported from this module (AGENTS.md front matter, bundle rule). **No GSAP**
 * (AGENTS.md 7.5); the only movement is the CSS transition the `Button`
 * primitive already carries.
 *
 * **No redirect on success** (AGENTS.md 10 rule 5). Accepting swaps this control
 * for a sentence and a link to the workspace, so the page keeps its scroll
 * position and the person chooses when to move.
 *
 * Every outcome is announced, takes focus, and is legible without colour
 * (AGENTS.md 8.2 rule 5) — the same left rule the auth screens and the
 * create-organisation form use.
 */

export function InvitationResponse({
  invitationId,
  organizationName,
  className = "",
}: {
  invitationId: string;
  organizationName: string;
  className?: string;
}) {
  const statusRef = useRef<HTMLDivElement>(null);

  const [pending, setPending] = useState<"accept" | "decline" | null>(null);
  const [settled, setSettled] = useState<"accept" | "decline" | null>(null);
  const [message, setMessage] = useState("");

  /* `statusRef` now serves only the settled panel below, which is not a
     `FormStatus` — it has its own class and body. The result line moved to
     `FormStatus` at prompt 105 and focuses itself on `message`, so this watches
     `settled` alone. The two are mutually exclusive, so the pair is
     behaviour-identical to the single effect it replaces. */
  useEffect(() => {
    if (settled) statusRef.current?.focus();
  }, [settled]);

  async function respond(decision: "accept" | "decline") {
    setMessage("");
    setPending(decision);
    try {
      const result = await respondToInvitation({ invitationId, decision });
      if (result.ok) {
        setSettled(decision);
        return;
      }
      // An honest failure is a visible state, never a silent success
      // (AGENTS.md 8.2 rule 4).
      setMessage(result.error);
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setPending(null);
    }
  }

  if (settled) {
    return (
      <div
        ref={statusRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className={`border-l-2 border-ink pl-4 outline-none ${className}`}
      >
        <h3 className="font-sans text-[20px] leading-[26px] font-bold">
          {settled === "accept" ? "Invitation accepted" : "Invitation declined"}
        </h3>
        <p className="mt-3 font-serif text-[18px] leading-[26px] text-muted">
          {settled === "accept"
            ? `You are a member of ${organizationName}. Your account page shows the organisation and what it holds.`
            : `Nothing was shared with you, and ${organizationName} has not been joined. You can close this page.`}
        </p>
        {settled === "accept" ? (
          <a
            href="/account"
            className="mt-4 inline-block font-mono text-[12px] leading-[18px] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Go to your account
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Kept mounted so the live region exists before the text arrives. */}
      <FormStatus message={message} as="div" className="mb-6" />

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => respond("accept")} disabled={pending !== null}>
          {pending === "accept" ? "Accepting..." : "Accept invitation"}
        </Button>
        <Button
          size="secondary"
          bullet={false}
          onClick={() => respond("decline")}
          disabled={pending !== null}
        >
          {pending === "decline" ? "Declining..." : "Decline"}
        </Button>
      </div>
    </div>
  );
}
