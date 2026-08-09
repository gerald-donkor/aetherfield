import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /* Next 16 defaults `qualities` to `[75]` and **silently coerces** any other
       `quality` prop to the nearest allowed entry — a `quality={90}` simply
       becomes 75 with no warning. 90 is allowlisted for the Capabilities
       section's sky photograph, which is a wide smooth gradient and is exactly
       what a low WebP quality smears. See AGENTS.md. */
    qualities: [75, 90],
  },
  experimental: {
    serverActions: {
      /* Build step 5's CV upload travels in a Server Action's `FormData`, and
         **Next caps a Server Action request body at 1 MB by default** — read
         from the installed docs,
         `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`:
         "the maximum size of the request body sent to a Server Action is 1MB",
         configurable with "the number of bytes or any string format supported
         by bytes, for example `1000`, `'500kb'` or `'3mb'`".

         The CV cap is 5 MB (`CV_MAX_BYTES` in `lib/validation/application.ts`).
         6 MB here leaves room for the multipart body's boundaries, part headers
         and the three text fields on top of the file — the same docs page puts
         that overhead at 10-20 KB for a typical upload, so the extra megabyte is
         generous rather than fitted, and it is a judgement, not a measurement.

         **The Zod cap, not this limit, is what a person ever sees.** A file over
         5 MB is rejected by the action with a field error; this value only has
         to sit above that so the framework never throws before the action runs.
         Lowering it below 5 MB would replace a rendered, announced error with an
         unhandled request failure. */
      bodySizeLimit: "6mb",
    },
  },
};

/* `withBotId` adds BotID's proxy rewrites — the challenge is served from this
   origin so ad blockers and third-party script blockers cannot quietly disable
   it. It adds rewrites only; no route's render mode changes. */
export default withBotId(nextConfig);
