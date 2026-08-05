"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

/* Registered once, at module scope — never inside a render. Every client
   module that animates imports `gsap` from here rather than from the package,
   so there is exactly one registration site and no ordering question.

   `SplitText` is free as of GSAP 3.13 and is bundled in the public package; it
   needs no auth token and no registry override. It is used by exactly one
   module — `home/hero-text.tsx` — and it reaches no other route because
   nothing outside `home/` imports this file. See AGENTS.md, "The hero's split
   blur-in", for why the earlier decision not to use it was overridden. */
gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

export { gsap, ScrollTrigger, SplitText, useGSAP };

/* The recording's vocabulary, in one place so the chart and the page reveals
   cannot drift apart: ~0.5s per element, ~0.08s between siblings, decelerating.
   That is a deliberate ~20% speed-up on the recording's own pace, at the user's
   request; the vocabulary itself is unchanged. See AGENTS.md, "Homepage
   motion". */
export const DUR = 0.5;
export const EASE = "power3.out";
