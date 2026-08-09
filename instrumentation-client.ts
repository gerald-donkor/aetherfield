import { initBotId } from "botid/client/core";

/**
 * BotID's client half — the challenge that `checkBotId()` in
 * `app/_actions/demo-request.ts` verifies. Both halves are required: without
 * this list the server call has nothing to check and fails rather than passes.
 *
 * **This file, and not a component in `app/layout.tsx`.** Next 15.3+ takes the
 * client half through `instrumentation-client.ts`, which is what lets BotID
 * ship without a provider around the root layout — AGENTS.md 8.1 forbids one,
 * and a root provider is the usual way a static site quietly goes dynamic.
 *
 * **The paths are page paths, not an API route.** A Server Action POSTs to the
 * page it was invoked from, so protecting `submitDemoRequest` means protecting
 * the routes the dialog is mounted on. Adding a fourth trigger surface means
 * adding its path here, or the action's BotID check will reject it.
 *
 * `/api/auth/*` is deliberately absent, and prompt 38's gap on it therefore
 * stays open: covering Better Auth's catch-all is a separate decision with its
 * own failure modes, not a side effect of this step.
 */
initBotId({
  protect: [
    // The hero's "Request a demo" and the CTA band, both on /.
    { path: "/", method: "POST" },
    // The same band, exhibited in the design system.
    { path: "/design-system", method: "POST" },
    // Build step 4 — the newsletter. The subscribe dialog is on /journal's
    // band, and the confirm and unsubscribe pages each invoke a token action.
    // These are page paths for the same reason the two above are: a Server
    // Action POSTs to the page it was invoked from.
    { path: "/journal", method: "POST" },
    { path: "/newsletter/confirm", method: "POST" },
    { path: "/newsletter/unsubscribe", method: "POST" },
    // Build step 5 — job applications. The apply dialog is on /careers'
    // open-application card and on every /job-listing/[slug].
    { path: "/careers", method: "POST" },
    /* **A glob, and it is verified rather than assumed.** `initBotId` compiles
       each `path` with
       `new RegExp("^" + path.replace(/[.?+^$[\]\\(){}|-]/g, "\\$&").split("*").join(".*") + "$")`
       — read from the installed package, `botid/dist/client/core/index.mjs`.
       Two consequences follow from that one line. A literal
       `/job-listing/[slug]` is regex-escaped, so it can only ever match a
       pathname containing those brackets and would never match a real request.
       `/job-listing/*` compiles to `^/job-listing/.*$` and matches all three
       listings — and it keeps matching when a fourth role is added to
       `app/_content/jobs.ts`, which a list of literal slugs would not. */
    { path: "/job-listing/*", method: "POST" },
  ],
});
