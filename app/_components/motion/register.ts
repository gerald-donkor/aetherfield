"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* Registered once, at module scope — never inside a render. Every client
   module that animates imports `gsap` from here rather than from the package,
   so there is exactly one registration site and no ordering question. */
gsap.registerPlugin(useGSAP, ScrollTrigger);

export { gsap, ScrollTrigger, useGSAP };

/* The recording's vocabulary, in one place so the chart and the page reveals
   cannot drift apart: ~0.5s per element, ~0.08s between siblings, decelerating.
   That is a deliberate ~20% speed-up on the recording's own pace, at the user's
   request; the vocabulary itself is unchanged. See AGENTS.md, "Homepage
   motion". */
export const DUR = 0.5;
export const EASE = "power3.out";
