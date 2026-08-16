"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { createOrganization } from "../../account/actions";
import {
  createOrganizationSchema,
  type CreateOrganizationFieldErrors,
  NO_ORGANIZATION_FIELD_ERRORS,
  slugifyOrganizationName,
} from "../../../lib/validation/organization";
import { Button, Field } from "../primitives";
import { FormStatus } from "../form-status";

/**
 * The create-organisation client leaf — build step 8, and a copy of
 * `newsletter/subscribe-dialog.tsx`'s shape rather than a second form
 * vocabulary. Same `Field` / `Button` primitives, the same announcement region,
 * the same typed-result handling.
 *
 * **Component-only, like every other client leaf.** No constant and no type is
 * exported from this module (AGENTS.md front matter, bundle rule).
 *
 * **The client parse is a courtesy, not a check.** `createOrganizationSchema`
 * runs here so the person is told about a bad slug before a round trip, and the
 * action re-runs the same schema as the actual check (AGENTS.md 6.2, 10 rule 1).
 *
 * **No redirect on success** (AGENTS.md 10 rule 5): the form swaps to its
 * confirmation in place, and the page keeps its scroll position.
 *
 * **No GSAP** (AGENTS.md 7.5). The only movement here is the CSS transition the
 * primitives already carry on their own borders and colours.
 */

const INTRO =
  "An organisation is the workspace your emissions, energy and waste data is recorded against. You can create one now; members and imports follow.";

/* Constants rather than inline JSX text: the site ships straight apostrophes,
   and `react/no-unescaped-entities` rejects one written inline. */
const SUCCESS_BODY =
  "You are the owner. Data import and reporting arrive with later releases, and the workspace is ready for them.";

const NETWORK_ERROR =
  "We couldn't reach the server. Check your connection and try again.";

export function CreateOrganizationForm({
  className = "",
}: {
  className?: string;
}) {
  const statusRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  /* Once the person edits the slug it is theirs, and the name stops writing
     over it. Derived-until-touched, not derived-always. */
  const [slugTouched, setSlugTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ name: string; slug: string } | null>(null);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<CreateOrganizationFieldErrors>(
    NO_ORGANIZATION_FIELD_ERRORS,
  );

  /* The outcome takes focus whenever it settles, so a screen reader lands on it
     rather than being told about it from wherever the caret was
     (AGENTS.md 8.2 rule 5). */
  /* `statusRef` now serves only the settled panel below, which is not a
     `FormStatus` — it has its own class and body. The result line moved to
     `FormStatus` at prompt 105 and focuses itself on `message`, so this watches
     `done` alone. The two are mutually exclusive, so the pair is
     behaviour-identical to the single effect it replaces. */
  useEffect(() => {
    if (done) statusRef.current?.focus();
  }, [done]);

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugifyOrganizationName(value));
  }

  function onSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(value);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const parsed = createOrganizationSchema.safeParse({ name, slug });
    if (!parsed.success) {
      const next = { ...NO_ORGANIZATION_FIELD_ERRORS };
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && field in next) {
          next[field as keyof CreateOrganizationFieldErrors] ||= issue.message;
        }
      }
      setErrors(next);
      setMessage("Check the marked fields and try again.");
      return;
    }

    setErrors(NO_ORGANIZATION_FIELD_ERRORS);
    setPending(true);
    try {
      const result = await createOrganization(parsed.data);
      if (result.ok) {
        setDone(parsed.data);
        setMessage("Organisation created.");
        return;
      }

      // An honest failure is a visible state, never a silent success
      // (AGENTS.md 8.2 rule 4).
      setErrors({ ...NO_ORGANIZATION_FIELD_ERRORS, ...result.fieldErrors });
      setMessage(result.error);
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div
        ref={statusRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className={`border-l-2 border-ink pl-4 outline-none ${className}`}
      >
        <h2 className="font-serif text-[28px] leading-tight">
          Organisation created
        </h2>
        <p className="mt-3 font-serif text-[18px] leading-[26px] text-muted">
          {done.name} is set up as {done.slug}. {SUCCESS_BODY}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className={className}>
      <p className="max-w-[560px] font-serif text-[18px] leading-[26px] text-muted">
        {INTRO}
      </p>

      {/* The failure announcement. Kept mounted so its `aria-live` region
          exists before the text arrives, and marked with the same left rule the
          auth screens use — legible without colour (AGENTS.md 8.2 rule 5). */}
      <FormStatus message={message} as="div" role="alert" className="mt-6" />

      <Field
        id="create-organization-name"
        name="name"
        label="Organisation name"
        autoComplete="organization"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        error={errors.name || undefined}
        disabled={pending}
        maxLength={160}
        required
        className="mt-6 max-w-[560px]"
      />
      <Field
        id="create-organization-slug"
        name="slug"
        label="Identifier"
        autoComplete="off"
        spellCheck={false}
        hint="Lowercase letters, numbers and hyphens. Filled in from the name until you change it."
        value={slug}
        onChange={(event) => onSlugChange(event.target.value)}
        error={errors.slug || undefined}
        disabled={pending}
        maxLength={48}
        required
        className="mt-6 max-w-[560px]"
      />
      <Button type="submit" className="mt-8" disabled={pending}>
        {pending ? "Creating organisation..." : "Create organisation"}
      </Button>
    </form>
  );
}
