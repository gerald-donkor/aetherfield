import { notFound, redirect } from "next/navigation";

import { requireSubmissionsAccount } from "../../../../../lib/auth/server";
import { getLiveApplicationCv } from "../../../../../lib/db/application-queries";
import { createCvReadUrl } from "../../../../../lib/storage/cv";
import { submissionIdSchema } from "../../../../../lib/validation/submissions";

export default async function ApplicationCvPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const callbackURL = `/submissions/applications/${encodeURIComponent(rawId)}/cv`;
  await requireSubmissionsAccount(callbackURL);

  const parsedId = submissionIdSchema.safeParse(rawId);
  if (!parsedId.success) notFound();

  const application = await getLiveApplicationCv(parsedId.data);
  if (!application) notFound();

  const destination = await createCvReadUrl(application.pathname);
  redirect(destination);
}
