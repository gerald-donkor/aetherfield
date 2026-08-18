"use client";

import { useEffect, useRef, useState } from "react";

import { retireCustomFactor } from "../../activity/factors/actions";
import { Button } from "../primitives";
import { useWrite } from "../use-write";

/**
 * Retires one customer-supplied factor row — prompt 67 decisions 3 and 8.
 *
 * **Component-only, and it is the whole leaf**: the row list itself is rendered
 * by `app/activity/factors/page.tsx` in the Server Component, so nothing here
 * fetches, and no constant or type is exported (the bundle rule, AGENTS.md
 * front matter).
 *
 * Retiring a factor that is in use silently unmaps every `(category, unit)`
 * pair pointing at it at the next recalculation, so the button **states the
 * consequence and takes a second, explicit click**. No `window.confirm` and no
 * dialog: a browser modal blocks the page, and this codebase has no confirm
 * primitive.
 *
 * The count that is announced afterwards is the server's own, taken inside the
 * retiring transaction — never the one this component was rendered with.
 */
export function RetireFactorButton({
  factorId,
  mappingCount,
}: {
  factorId: string;
  mappingCount: number;
}) {
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [armed, setArmed] = useState(false);
  const write = useWrite<"factorId">();
  const { pending, message } = write;

  useEffect(() => {
    if (message) statusRef.current?.focus();
  }, [message]);

  async function click() {
    if (!armed) {
      setArmed(true);
      /* Announced, not only styled: the arm state is the warning. */
      write.setMessage(
        mappingCount > 0
          ? `Retiring this factor leaves ${mappingCount.toLocaleString(
              "en-GB",
            )} mapped ${
              mappingCount === 1 ? "pair" : "pairs"
            } unmapped at the next recalculation. Select confirm to retire it.`
          : "This factor is not mapped to any category and unit. Select confirm to retire it.",
      );
      return;
    }

    await write.submit({
      /* `retireCustomFactor`'s generic `error` is not what this control has
         always shown — the specific `fieldErrors.factorId` is, when one
         exists. See `retire-set-button.tsx` for the identical reasoning. */
      call: async () => {
        const result = await retireCustomFactor({ factorId });
        return result.ok
          ? result
          : { ...result, error: result.fieldErrors?.factorId ?? result.error };
      },
      onSuccess: (result) => {
        setArmed(false);
        return result.mappingCount > 0
          ? `Factor retired. ${result.mappingCount.toLocaleString(
              "en-GB",
            )} mapped ${
              result.mappingCount === 1 ? "pair is" : "pairs are"
            } now unmapped and outside the total until a factor is chosen again.`
          : "Factor retired. No mapped pairs were using it.";
      },
    });
  }

  return (
    <div className="lg:text-right">
      <Button
        type="button"
        size="secondary"
        bullet={false}
        disabled={pending}
        onClick={() => void click()}
      >
        {pending ? "Retiring..." : armed ? "Confirm retire" : "Retire"}
      </Button>
      {armed && !pending ? (
        <Button
          type="button"
          size="secondary"
          bullet={false}
          className="mt-3 ml-3"
          onClick={() => {
            setArmed(false);
            write.setMessage("Retirement cancelled.");
          }}
        >
          Cancel
        </Button>
      ) : null}
      <p
        ref={statusRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className={`border-l-2 border-ink pl-4 text-left font-mono text-[12px] leading-[18px] outline-none ${
          message ? "mt-4 block max-w-[34rem] lg:ml-auto" : "hidden"
        }`}
      >
        {message}
      </p>
    </div>
  );
}
