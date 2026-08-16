"use client";

import { useEffect, useRef, useState } from "react";

import { confirmSubscription, unsubscribe } from "../../_actions/newsletter";
import type { NewsletterTokenState } from "../../../lib/validation/newsletter";
import { Button, ButtonLink } from "../primitives";
import { NETWORK_ERROR } from "../../../lib/validation/result";

/**
 * The one button on `/newsletter/confirm` and `/newsletter/unsubscribe`.
 *
 * **The transition does not happen on render, and that is deliberate.** Two
 * reasons, either of which alone would settle it:
 *
 * 1. AGENTS.md 6.2 puts every mutation in a Server Action. A page that confirms
 *    while rendering is a GET that writes.
 * 2. Corporate mail scanners follow links in email before a person ever sees
 *    them. A GET that confirms lets a scanner opt someone in, and a GET that
 *    unsubscribes lets one silently opt them out — which is the more common
 *    industry choice and the reason double opt-in quietly stops working inside
 *    some organisations.
 *
 * The cost is one extra click. It is stated here rather than buried because
 * confirming on render is what most implementations do.
 *
 * **Every outcome gets its own copy** (AGENTS.md 8.2 rules 4 and 5) rather than
 * one "something went wrong": a person whose link expired needs to know to
 * subscribe again, and a person who already confirmed needs to know nothing is
 * broken. The result is announced through a focused `role="status"` and is
 * legible without colour — this page has no colour state at all.
 */

type Kind = "confirm" | "unsubscribe";

/** What the button says, and what each terminal state reads as. Keyed by state
    so the action returns a state and never a sentence — the copy lives on this
    side of the boundary, where the rest of the site's copy lives. */
const COPY: Record<
  Kind,
  {
    action: string;
    pending: string;
    states: Record<NewsletterTokenState, string>;
  }
> = {
  confirm: {
    action: "Confirm subscription",
    pending: "Confirming...",
    states: {
      confirmed:
        "Confirmed. You are subscribed to Aetherfield Journal, and a welcome message is on its way. Every issue carries a link to stop.",
      "already-confirmed":
        "This address is already confirmed. Nothing further is needed, and no second subscription was created.",
      expired:
        "This confirmation link has expired. Subscribe again from the journal and a new link will be sent.",
      unsubscribed:
        "This address was unsubscribed. Subscribe again from the journal to start receiving the journal once more.",
      "already-unsubscribed":
        "This address is no longer subscribed. Subscribe again from the journal to start receiving it once more.",
      unknown:
        "We don't recognise this link. It may have been replaced by a newer one — subscribe again from the journal and a fresh link will be sent.",
      missing:
        "This address is missing its confirmation token. Open the link from the email exactly as it was sent, or subscribe again from the journal.",
    },
  },
  unsubscribe: {
    action: "Unsubscribe",
    pending: "Unsubscribing...",
    states: {
      unsubscribed:
        "Unsubscribed. This address will receive no further issues of Aetherfield Journal.",
      "already-unsubscribed":
        "This address was already unsubscribed. It will receive no further issues.",
      confirmed: "This address is subscribed.",
      "already-confirmed": "This address is subscribed.",
      expired:
        "This link has expired. Any recent issue carries a working unsubscribe link.",
      unknown:
        "We don't recognise this link. Any recent issue of the journal carries a working unsubscribe link.",
      missing:
        "This address is missing its unsubscribe token. Open the link from the email exactly as it was sent.",
    },
  },
};

export function NewsletterTokenAction({
  kind,
  token,
}: {
  kind: Kind;
  /** Absent when the URL carried no `?token=` — the page renders the `missing`
      copy and no button, because there is nothing to submit. */
  token?: string;
}) {
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<NewsletterTokenState | null>(
    token ? null : "missing",
  );
  const [error, setError] = useState("");

  const copy = COPY[kind];
  const announcement = error || (state ? copy.states[state] : "");

  useEffect(() => {
    if (announcement) statusRef.current?.focus();
  }, [announcement]);

  async function run() {
    if (!token) return;
    setError("");
    setPending(true);
    try {
      const result =
        kind === "confirm"
          ? await confirmSubscription(token)
          : await unsubscribe(token);
      if (result.ok) setState(result.state);
      else setError(result.error);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  /* Any `state` at all is a final classification of this token — expired and
     unknown included — so the button is spent and gives way to a route back
     into the site. Only `error` leaves it, because a rate limit or an
     unreachable database is the one thing worth clicking again. */
  const spent = state !== null;

  return (
    <>
      {announcement ? (
        <p
          ref={statusRef}
          role="status"
          aria-live="polite"
          tabIndex={-1}
          className="mt-6 border-l-2 border-ink pl-4 font-serif text-[18px] leading-[26px] text-ink outline-none"
        >
          {announcement}
        </p>
      ) : null}

      {spent ? (
        <ButtonLink href="/journal" className="mt-8 w-full">
          Read the journal
        </ButtonLink>
      ) : (
        <Button className="mt-8 w-full" onClick={run} disabled={pending}>
          {pending ? copy.pending : copy.action}
        </Button>
      )}
    </>
  );
}
