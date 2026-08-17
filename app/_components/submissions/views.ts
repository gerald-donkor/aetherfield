import type { SubmissionView } from "../../../lib/validation/submissions";

/**
 * The submissions workspace's view vocabulary — which views exist, what each is
 * called, and how a view and its page travel in the query string.
 *
 * Moved out of `app/submissions/page.tsx` by prompt 120. It is one concern: the
 * page's view nav, its pagination and its sign-in callback all encode the same
 * three parameters, and they were previously the only thing three unrelated
 * top-level declarations in that file had in common.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

export const VIEW_LABELS: Record<SubmissionView, string> = {
  leads: "Leads",
  subscribers: "Subscribers",
  applications: "Applications",
  staff: "Staff",
};

export function requestedCallback(query: RawSearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  const serialized = params.toString();
  return serialized ? `/submissions?${serialized}` : "/submissions";
}

export function viewHref(view: SubmissionView, page = 1): string {
  const params = new URLSearchParams({ view });
  if (page > 1) params.set("page", String(page));
  return `/submissions?${params.toString()}`;
}
