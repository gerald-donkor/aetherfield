"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "../_components/primitives";
import type { SubmissionKind } from "../../lib/validation/submissions";
import { changeStaffRole, removeSubmission } from "./actions";

function ResultMessage({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);

  return (
    <p
      ref={ref}
      role="status"
      aria-live="polite"
      tabIndex={-1}
      className="mt-3 max-w-[34rem] font-mono text-[12px] leading-[18px] outline-none"
    >
      {message}
    </p>
  );
}

export function StaffRoleControl({
  userId,
  displayName,
  isStaff,
}: {
  userId: string;
  displayName: string;
  isStaff: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    setPending(true);
    setMessage("");
    try {
      const result = await changeStaffRole({
        userId,
        role: isStaff ? "none" : "staff",
      });
      setMessage(
        result.ok
          ? isStaff
            ? `Staff access revoked for ${displayName}.`
            : `Staff access granted to ${displayName}.`
          : result.error,
      );
    } catch {
      setMessage("We couldn't reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4 lg:mt-0 lg:border-0 lg:pt-0">
      <Button
        size="compact"
        bullet={false}
        onClick={submit}
        disabled={pending}
        className="min-w-[132px]"
      >
        {pending
          ? "Updating..."
          : isStaff
            ? "Revoke staff"
            : "Grant staff"}
      </Button>
      <ResultMessage message={message} />
    </div>
  );
}

export function RemoveSubmissionControl({
  kind,
  id,
  label,
}: {
  kind: SubmissionKind;
  id: string;
  label: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function remove() {
    setPending(true);
    setMessage("");
    try {
      const result = await removeSubmission({ kind, id });
      setMessage(result.ok ? `${label} removed.` : result.error);
      if (!result.ok) setConfirming(false);
    } catch {
      setMessage("We couldn't reach the server. Please try again.");
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4 lg:mt-0 lg:border-0 lg:pt-0">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px]">Remove this record?</span>
          <Button
            size="compact"
            bullet={false}
            onClick={remove}
            disabled={pending}
          >
            {pending ? "Removing..." : "Confirm remove"}
          </Button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="h-[38px] px-3 font-mono text-button font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Cancel
          </button>
        </div>
      ) : (
        <Button
          size="compact"
          bullet={false}
          onClick={() => {
            setMessage("");
            setConfirming(true);
          }}
        >
          Remove
        </Button>
      )}
      <ResultMessage message={message} />
    </div>
  );
}
