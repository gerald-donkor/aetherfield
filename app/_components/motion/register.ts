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
   cannot drift apart: ~0.6s per element, ~0.1s between siblings, decelerating.
   See AGENTS.md, "Homepage motion". */
export const DUR = 0.6;
export const EASE = "power3.out";
