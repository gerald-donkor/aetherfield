"use client";

import { useEffect, useRef, useState } from "react";

import { retireTarget } from "../../targets/actions";
import { Button } from "../primitives";

const NETWORK_ERROR =
  "We couldn't reach the server. Check your connection and try again.";

export function RetireTargetControl({ targetId }: { targetId: string }) {
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (message) statusRef.current?.focus();
  }, [message]);

  async function retire() {
    setPending(true);
    setMessage("");
    try {
      const result = await retireTarget(targetId);
      setMessage(result.ok ? "Target retired." : result.error);
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
        onClick={retire}
        disabled={pending}
      >
        {pending ? "Retiring..." : "Retire target"}
      </Button>
      <p
        ref={statusRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className={`mt-3 border-l-2 border-ink pl-3 font-mono text-[11px] leading-[18px] outline-none ${
          message ? "block" : "hidden"
        }`}
      >
        {message}
      </p>
    </div>
  );
}
