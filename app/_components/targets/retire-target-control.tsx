"use client";

import { useEffect, useRef, useState } from "react";

import { retireTarget } from "../../targets/actions";
import { Button } from "../primitives";
import { FormStatus } from "../form-status";
import { useWrite } from "../use-write";

/**
 * Retiring one target — build step 11's only destructive control, given the
 * site's one confirmation idiom at prompt 118.
 *
 * **The confirm/cancel step is step 7's, matched not reinvented.**
 * `app/submissions/action-controls.tsx` established "Remove" -> inline question
 * -> "Confirm remove" / "Cancel"; `app/_components/organization/members-panel.tsx`
 * adopted it for Remove and Leave and its docblock names it as the convention.
 * This is the third adopter and it copies that structure, those element choices
 * and that class string rather than designing a third variant. **No native
 * `confirm()`**: a browser modal blocks the page and is not the site's idiom.
 *
 * **The wording is a safeguard, not a courtesy, and the code is why.**
 * `retireTarget` in `lib/db/target-queries.ts` sets `status = 'retired'` and
 * stamps `retired_at`; it deletes nothing and never touches `deleted_at`, and
 * `emission_target`'s own schema docblock calls it "a soft transition rather
 * than a delete". So the *record* survives — `TargetCard` keeps rendering it and
 * says so. But **nothing in this codebase writes `status` back to `active`**:
 * there is no reactivate query, no reactivate action, and `TargetCard` stops
 * rendering this control once the target is retired. So the *state change* is
 * terminal from the UI, and the question says that instead of implying an undo
 * that does not exist.
 *
 * **This is presentation and it adds no enforcement** (AGENTS.md 6.2, 11.2
 * rule 2). `retireTarget` still resolves the tenant, re-reads the membership
 * from Postgres, spends its rate limit and predicates the update on the
 * organisation — arming a button in the browser is not a check and this change
 * did not touch the action.
 *
 * **Focus is returned to "Retire target" on cancel**, which is one step past the
 * two existing adopters: they unmount the Cancel button and let focus fall to
 * the document body. AGENTS.md 8.2 rule 5 asks for managed focus, so the armed
 * state is dismissible by keyboard without losing the caret. The flag ref keeps
 * that from firing on first mount, when nothing was ever armed.
 *
 * **No GSAP** (AGENTS.md 7.5). **No redirect on success** (AGENTS.md 10 rule 5)
 * — the action revalidates `/targets` and the card re-renders in place.
 */
export function RetireTargetControl({ targetId }: { targetId: string }) {
  const armRef = useRef<HTMLButtonElement>(null);
  /* True only between a Cancel click and the effect that answers it, so the
     effect cannot steal focus on mount or after a failed confirm. */
  const restoreFocus = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const write = useWrite();
  const { pending, message } = write;

  useEffect(() => {
    if (confirming || !restoreFocus.current) return;
    restoreFocus.current = false;
    armRef.current?.focus();
  }, [confirming]);

  async function retire() {
    const ok = await write.submit({
      call: () => retireTarget(targetId),
      onSuccess: () => "Target retired.",
    });
    if (!ok) setConfirming(false);
  }

  return (
    <div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px]">
            Retire this target? It cannot be made active again.
          </span>
          <Button
            size="secondary"
            bullet={false}
            onClick={retire}
            disabled={pending}
          >
            {pending ? "Retiring..." : "Confirm retire"}
          </Button>
          <button
            type="button"
            onClick={() => {
              restoreFocus.current = true;
              setConfirming(false);
            }}
            disabled={pending}
            className="h-[38px] px-3 font-mono text-button font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Cancel
          </button>
        </div>
      ) : (
        <Button
          ref={armRef}
          size="secondary"
          bullet={false}
          onClick={() => {
            write.setMessage("");
            setConfirming(true);
          }}
        >
          Retire target
        </Button>
      )}
      {/* Only the completed action is announced. Arming is not a result, so it
          sets no message — and clearing the message on arm is what keeps a
          previous failure from reading as a comment on this attempt. */}
      <FormStatus message={message} className="mt-3" />
    </div>
  );
}
