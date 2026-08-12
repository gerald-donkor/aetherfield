"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import {
  cancelInvitation,
  inviteMember,
  leaveOrganization,
  removeMember,
} from "../../account/actions";
import {
  type InviteMemberFieldErrors,
  inviteMemberSchema,
  NO_INVITE_FIELD_ERRORS,
  ORGANIZATION_ROLES,
} from "../../../lib/validation/organization";
import { Button, Field } from "../primitives";

/**
 * The organisation's members surface — prompt 63, closing what build step 8
 * deferred.
 *
 * **Component-only**, like every other client leaf: no constant and no type is
 * exported from this module (AGENTS.md front matter, bundle rule). Built from
 * `Field` and `Button` and nothing else — AGENTS.md 7.5 forbids a second design
 * system, and this is not the place a third field vocabulary appears.
 *
 * **The confirm/cancel step on a destructive control is step 7's, matched not
 * reinvented**: `app/submissions/action-controls.tsx` established "Remove" ->
 * inline question -> "Confirm remove" / "Cancel", and Remove and Leave both use
 * it here so the site has one confirmation idiom.
 *
 * **No GSAP** (AGENTS.md 7.5). **No redirect on success** (AGENTS.md 10 rule 5)
 * — every action revalidates `/account` and the section re-renders in place.
 *
 * **The owner-only controls are hidden here and enforced in the action.**
 * Hiding a control is presentation and is never the check (AGENTS.md 11.2
 * rule 2); every action re-reads the caller's role from Postgres.
 *
 * **The client parse is a courtesy, not a check** (AGENTS.md 6.2, 10 rule 1):
 * `inviteMemberSchema` runs here so a mistyped address is caught before a round
 * trip, and the action re-runs the same schema as the actual check.
 */

const NETWORK_ERROR =
  "We couldn't reach the server. Check your connection and try again.";

type PanelMember = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  isSelf: boolean;
};

type PanelInvitation = {
  id: string;
  email: string;
  roleLabel: string;
  expiresLabel: string;
};

/** One announcement region, shared shape. Takes focus whenever it settles so a
    screen reader lands on the outcome rather than being told about it from
    wherever the caret was (AGENTS.md 8.2 rule 5), and marked with the same left
    rule the auth screens use — legible without colour. */
function Announcement({ message }: { message: string }) {
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
      className={`mt-3 max-w-[34rem] border-l-2 border-ink pl-4 font-mono text-[12px] leading-[18px] outline-none ${
        message ? "block" : "hidden"
      }`}
    >
      {message}
    </p>
  );
}

function RemoveMemberControl({
  memberId,
  displayName,
}: {
  memberId: string;
  displayName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function remove() {
    setPending(true);
    setMessage("");
    try {
      const result = await removeMember({ memberId });
      setMessage(
        result.ok ? `${displayName} no longer has access.` : result.error,
      );
      if (!result.ok) setConfirming(false);
    } catch {
      setMessage(NETWORK_ERROR);
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 lg:mt-0">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px]">Remove this member?</span>
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
      <Announcement message={message} />
    </div>
  );
}

function CancelInvitationControl({ invitationId }: { invitationId: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function cancel() {
    setPending(true);
    setMessage("");
    try {
      const result = await cancelInvitation({ invitationId });
      setMessage(result.ok ? "Invitation withdrawn." : result.error);
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 lg:mt-0">
      <Button size="compact" bullet={false} onClick={cancel} disabled={pending}>
        {pending ? "Withdrawing..." : "Withdraw"}
      </Button>
      <Announcement message={message} />
    </div>
  );
}

function LeaveControl({
  organizationName,
  viewerIsOwner,
}: {
  organizationName: string;
  viewerIsOwner: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function leave() {
    setPending(true);
    setMessage("");
    try {
      const result = await leaveOrganization();
      setMessage(
        result.ok
          ? `You have left ${organizationName}. It no longer appears on your account.`
          : result.error,
      );
      if (!result.ok) setConfirming(false);
    } catch {
      setMessage(NETWORK_ERROR);
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-8 border-t border-border pt-6">
      <p className="max-w-[560px] font-serif text-[18px] leading-[26px] text-muted">
        Leaving gives up your access to {organizationName}. The organisation and
        its data stay as they are, and an owner can invite you back.
        {viewerIsOwner
          ? " An organisation always keeps one owner, so if you are the only one, invite another owner first."
          : ""}
      </p>
      {confirming ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px]">
            Leave this organisation?
          </span>
          <Button
            size="compact"
            bullet={false}
            onClick={leave}
            disabled={pending}
          >
            {pending ? "Leaving..." : "Confirm leave"}
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
          className="mt-4"
          onClick={() => {
            setMessage("");
            setConfirming(true);
          }}
        >
          Leave organisation
        </Button>
      )}
      <Announcement message={message} />
    </div>
  );
}

function InviteForm() {
  const statusRef = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ORGANIZATION_ROLES)[number]>(
    "member",
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<InviteMemberFieldErrors>(
    NO_INVITE_FIELD_ERRORS,
  );

  useEffect(() => {
    if (message) statusRef.current?.focus();
  }, [message]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const parsed = inviteMemberSchema.safeParse({ email, role });
    if (!parsed.success) {
      const next = { ...NO_INVITE_FIELD_ERRORS };
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && field in next) {
          next[field as keyof InviteMemberFieldErrors] ||= issue.message;
        }
      }
      setErrors(next);
      setMessage("Check the marked fields and try again.");
      return;
    }

    setErrors(NO_INVITE_FIELD_ERRORS);
    setPending(true);
    try {
      const result = await inviteMember(parsed.data);
      if (result.ok) {
        setMessage(`Invitation sent to ${parsed.data.email}.`);
        setEmail("");
        setRole("member");
        return;
      }
      setErrors({ ...NO_INVITE_FIELD_ERRORS, ...result.fieldErrors });
      setMessage(result.error);
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8">
      <p className="max-w-[560px] font-serif text-[18px] leading-[26px] text-muted">
        An invitation is a single link, sent to one address, that expires after
        48 hours. Nothing is shared until it is accepted.
      </p>

      <div
        ref={statusRef}
        role="alert"
        aria-live="assertive"
        tabIndex={-1}
        className={`mt-6 border-l-2 border-ink pl-4 font-mono text-[12px] leading-[18px] outline-none ${
          message ? "block" : "hidden"
        }`}
      >
        {message}
      </div>

      <Field
        id="invite-member-email"
        name="email"
        type="email"
        label="Work email"
        autoComplete="off"
        spellCheck={false}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={errors.email || undefined}
        disabled={pending}
        maxLength={254}
        required
        className="mt-6 max-w-[560px]"
      />

      {/* A radio group rather than a select: two options, and the difference
          between them is worth reading rather than opening. */}
      <fieldset className="mt-6 max-w-[560px]">
        <legend className="block font-sans text-nav font-bold text-ink">
          Role
        </legend>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex items-start gap-3 font-serif text-[16px] leading-[24px]">
            <input
              type="radio"
              name="invite-member-role"
              value="member"
              checked={role === "member"}
              onChange={() => setRole("member")}
              disabled={pending}
              className="mt-[5px] size-4 accent-ink"
            />
            <span>
              <span className="font-sans font-bold">Member</span>
              <span className="block text-muted">
                Reads and records the organisation&apos;s data.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 font-serif text-[16px] leading-[24px]">
            <input
              type="radio"
              name="invite-member-role"
              value="owner"
              checked={role === "owner"}
              onChange={() => setRole("owner")}
              disabled={pending}
              className="mt-[5px] size-4 accent-ink"
            />
            <span>
              <span className="font-sans font-bold">Owner</span>
              <span className="block text-muted">
                Everything a member can, plus inviting and removing people.
              </span>
            </span>
          </label>
        </div>
        {errors.role ? (
          <p className="mt-2 flex items-start gap-2 font-mono text-[12px] leading-[18px] text-ink">
            <span aria-hidden className="mt-[7px] size-1 shrink-0 bg-ink" />
            {errors.role}
          </p>
        ) : null}
      </fieldset>

      <Button type="submit" className="mt-8" disabled={pending}>
        {pending ? "Sending invitation..." : "Send invitation"}
      </Button>
    </form>
  );
}

export function MembersPanel({
  members,
  invitations,
  viewerIsOwner,
  organizationName,
  className = "",
}: {
  members: PanelMember[];
  invitations: PanelInvitation[];
  viewerIsOwner: boolean;
  organizationName: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="max-w-[680px] font-serif text-p2 text-muted">
        Everyone below can see what {organizationName} records. An owner manages
        who that is.
      </p>

      <ul className="mt-8 border-t border-border">
        {members.map((entry) => (
          <li
            key={entry.id}
            className="border-b border-border py-5 lg:flex lg:items-center lg:justify-between lg:gap-6"
          >
            <div>
              <p className="font-sans text-[18px] leading-[24px] font-bold">
                {entry.name}
                {entry.isSelf ? (
                  <span className="ml-2 font-mono text-[12px] font-medium text-muted">
                    YOU
                  </span>
                ) : null}
              </p>
              <p className="mt-1 font-serif text-[16px] leading-[24px] text-muted">
                {entry.email}
              </p>
              <p className="mt-1 font-mono text-[12px] leading-[18px] text-muted">
                {entry.roleLabel.toUpperCase()}
              </p>
            </div>
            {/* Hidden for the viewer's own row: leaving is the deliberate,
                separately confirmed door out, and the last-owner rule lives
                there. Enforced in the action regardless. */}
            {viewerIsOwner && !entry.isSelf ? (
              <RemoveMemberControl
                memberId={entry.id}
                displayName={entry.name}
              />
            ) : null}
          </li>
        ))}
      </ul>

      {/* Pending invitations are shown to owners only. A member gains nothing
          operational from a list of addresses that have been written to, and
          the smaller disclosure is the right default (AGENTS.md 8.3 rule 1's
          reasoning, applied to what is displayed). */}
      {viewerIsOwner ? (
        <div className="mt-10">
          <p className="font-mono text-caption text-muted">
            PENDING INVITATIONS
          </p>
          {invitations.length === 0 ? (
            <p className="mt-4 max-w-[560px] font-serif text-[18px] leading-[26px] text-muted">
              No invitation is outstanding.
            </p>
          ) : (
            <ul className="mt-4 border-t border-border">
              {invitations.map((entry) => (
                <li
                  key={entry.id}
                  className="border-b border-border py-5 lg:flex lg:items-center lg:justify-between lg:gap-6"
                >
                  <div>
                    <p className="font-serif text-[18px] leading-[24px]">
                      {entry.email}
                    </p>
                    <p className="mt-1 font-mono text-[12px] leading-[18px] text-muted">
                      {entry.roleLabel.toUpperCase()} — EXPIRES{" "}
                      {entry.expiresLabel.toUpperCase()}
                    </p>
                  </div>
                  <CancelInvitationControl invitationId={entry.id} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {viewerIsOwner ? <InviteForm /> : null}

      {/* Shown to everyone, including a sole owner. The last-owner rule can
          make it unreachable for them, and the copy says so rather than the
          control being hidden — an ownership transfer flow is out of scope
          (prompt 63's non-goals), and inviting a second owner is the way
          through. */}
      <LeaveControl
        organizationName={organizationName}
        viewerIsOwner={viewerIsOwner}
      />
    </div>
  );
}
