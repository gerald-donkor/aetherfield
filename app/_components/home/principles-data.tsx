/* The three principles, as data.

   A module of its own, with **no component imports**, because /about's "Our
   values" cards are these three items verbatim and `principles.tsx` now pulls
   in the client-side `Reveal`. Importing the constant from there would put
   GSAP into /about's client chunk graph for a plain array — the same bundle
   discipline `chrome.tsx` follows by inlining `CONTAINER`. `principles.tsx`
   re-exports it, so `home/sections` and every existing import still resolve. */
export const PRINCIPLES = [
  {
    title: "Clarity drives action",
    body: "We believe better decisions start with better data—measured, visible, and trusted.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18M12 12h9" />
      </>
    ),
  },
  {
    title: "Sustainability is a systems problem",
    body: "We build tools that help teams connect the dots between operations, impact, and accountability.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.4 3.9 5.6 3.9 9s-1.4 6.6-3.9 9c-2.5-2.4-3.9-5.6-3.9-9S9.5 5.4 12 3Z" />
      </>
    ),
  },
  {
    title: "Progress over perfection",
    body: "We support real-world momentum—helping organizations move from ambition to measurable change.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 15l6-6M10 9h5v5" />
      </>
    ),
  },
];

