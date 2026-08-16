"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { retireFactorSet } from "../../activity/actions";
import { Button } from "../primitives";
import { FormStatus } from "../form-status";
import { NETWORK_ERROR } from "../../../lib/validation/result";

/**
 * Retires one customer-supplied factor set — prompt 84.
 *
 * **`RetireFactorButton`'s arm → confirm → announce pattern, copied rather than
 * re-invented.** No `window.confirm` and no dialog, for the reason that file
 * records: a browser modal blocks the page, and this codebase has no confirm
 * primitive. Component-only, and the set list itself is the Server Component's
 * (the bundle rule, AGENTS.md front matter).
 *
 * The warning carries the numbers the page was rendered with; the confirmation
 * carries the **server's** own, taken inside the retiring transaction.
 *
 * Retirement is the set's `deleted_at` and **does not cascade to its rows**
 * (decision 4): every read path already excludes them through the set join, so
 * the rows stay live and the surface says so rather than implying they were
 * deleted.
 */
export function RetireSetButton({
  setId,
  factorCount,
  label,
}: {
  setId: string;
  factorCount: number;
  label: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function click() {
    if (!armed) {
      setArmed(true);
      /* Announced, not only styled: the arm state is the warning. */
      setMessage(
        `Retiring ${label} takes its ${factorCount.toLocaleString("en-GB")} active ${
          factorCount === 1 ? "row" : "rows"
        } out of use. Any mapped pair using one is unmapped at the next recalculation, and reports already built keep the evidence they were built with. Select confirm to retire it.`,
      );
      return;
    }

    setPending(true);
    try {
      const result = await retireFactorSet({ setId });
      if (result.ok) {
        setArmed(false);
        setMessage(
          result.mappingCount > 0
            ? `Set retired. Its ${result.factorCount.toLocaleString("en-GB")} ${
                result.factorCount === 1 ? "row is" : "rows are"
              } no longer selectable, and ${result.mappingCount.toLocaleString(
                "en-GB",
              )} mapped ${
                result.mappingCount === 1 ? "pair is" : "pairs are"
              } now unmapped and outside the total until a factor is chosen again.`
            : `Set retired. Its ${result.factorCount.toLocaleString("en-GB")} ${
                result.factorCount === 1 ? "row is" : "rows are"
              } no longer selectable. No mapped pairs were using them.`,
        );
        router.refresh();
      } else {
        setMessage(result.fieldErrors?.setId ?? result.error);
      }
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        size="secondary"
        bullet={false}
        disabled={pending}
        onClick={() => void click()}
      >
        {pending ? "Retiring..." : armed ? "Confirm retire set" : "Retire set"}
      </Button>
      {armed && !pending ? (
        <Button
          type="button"
          size="secondary"
          bullet={false}
          className="mt-3 ml-3"
          onClick={() => {
            setArmed(false);
            setMessage("Retirement cancelled.");
          }}
        >
          Cancel
        </Button>
      ) : null}
      <FormStatus message={message} shown="mt-4 block max-w-[34rem]" />
    </div>
  );
}
