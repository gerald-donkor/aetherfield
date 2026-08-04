/**
 * Open roles behind `/careers`. The page renders a list, so the list is data —
 * the same split `_content/articles.ts` makes for the journal.
 *
 * Transcribed from `public/assets/pages/10-careers/screen-sizes/Desktop.png`.
 * Straight apostrophes, per the convention the six articles already ship.
 */
export type Job = {
  role: string;
  type: string;
  location: string;
  body: string;
  /** Label on the card's action. */
  action: string;
  /** The open-application card is drawn as a dashed outline, not a white card. */
  open?: boolean;
};

export const JOBS: Job[] = [
  {
    role: "UX Designer",
    type: "Contract",
    location: "San Francisco, CA",
    body: "Shape the tools that drive climate intelligence. You'll lead cross-functional teams to build thoughtful, scalable solutions for sustainability-forward organizations.",
    action: "View role",
  },
  {
    role: "Data Scientist",
    type: "Full-time",
    location: "Denver, CO",
    body: "Help build the intelligence layer for climate action. You'll turn complex sustainability data into clear, actionable insights for enterprise teams.",
    action: "View role",
  },
  {
    role: "Product Manager",
    type: "Part-time",
    location: "Seattle, WA",
    // The comp repeats the UX Designer body verbatim on this card.
    body: "Shape the tools that drive climate intelligence. You'll lead cross-functional teams to build thoughtful, scalable solutions for sustainability-forward organizations.",
    action: "View role",
  },
  {
    role: "Open application",
    // Shipped as drawn: the comp gives the open-application card a real role's
    // meta line. It reads like placeholder left in by mistake, but the comp is
    // the source of truth — drop this line if the designer confirms.
    type: "Full-time",
    location: "Denver, CO",
    body: "Don't see your role available? Apply for an open application!",
    action: "Apply now",
    open: true,
  },
];
