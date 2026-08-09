import * as z from "zod";

/** Browser-safe contracts for every value a submissions URL or control owns. */
export const submissionViewSchema = z.enum([
  "leads",
  "subscribers",
  "applications",
  "staff",
]);

export type SubmissionView = z.infer<typeof submissionViewSchema>;

/* Six decimal digits bounds the representation before it can influence an
   offset. The numeric ceiling keeps the computed offset a safe integer. */
const pageValueSchema = z
  .string()
  .regex(/^\d{1,6}$/)
  .transform(Number)
  .pipe(z.int().positive().max(100_000));

export const submissionIdSchema = z.uuid();
/* Better Auth 1.6.26's installed default generateId() emits 32 characters
   from a-z/A-Z/0-9. Existing auth rows use that format; they are not UUIDs. */
export const authUserIdSchema = z.string().regex(/^[A-Za-z0-9]{32}$/);
export const staffRoleInputSchema = z.enum(["staff", "none"]);
export const submissionKindSchema = z.enum([
  "lead",
  "subscriber",
  "application",
]);

export function parseSubmissionView(value: unknown): SubmissionView {
  const parsed = submissionViewSchema.safeParse(value);
  return parsed.success ? parsed.data : "leads";
}

export function parseSubmissionPage(value: unknown): number {
  const parsed = pageValueSchema.safeParse(value);
  return parsed.success ? parsed.data : 1;
}

export const staffMutationSchema = z.object({
  userId: authUserIdSchema,
  role: staffRoleInputSchema,
});

export const submissionRemovalSchema = z.object({
  kind: submissionKindSchema,
  id: submissionIdSchema,
});

export type SubmissionKind = z.infer<typeof submissionKindSchema>;
export type StaffRoleInput = z.infer<typeof staffRoleInputSchema>;
