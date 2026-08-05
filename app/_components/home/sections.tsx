/**
 * Barrel for the homepage sections — `app/page.tsx` imports the six of them
 * from here. The sections themselves live one per file. Do not add markup here.
 *
 * **Nothing outside `home/` may import this module.** The barrel reaches every
 * section, and the sections reach the client-side `Reveal`, so an unrelated
 * page importing `Container` through here would pull GSAP's ~118 KB into that
 * route's client chunk graph — measured: before this split, `/careers`,
 * `/about`, `/journal`, the articles and the job listings all gained the
 * homepage's GSAP chunk in their prerendered `<script>` list.
 *
 * So the five pages outside `home/` import the leaf modules directly:
 * `home/container` for `Container` and `home/principles-data` for `PRINCIPLES`.
 * Both are component-free, which is what keeps those routes' HTML byte-identical.
 */
export * from "./container";
export * from "./hero";
export * from "./capabilities";
export * from "./principles";
export * from "./case-study";
export * from "./journal";
export * from "./testimonial";
