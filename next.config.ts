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
};

/* `withBotId` adds BotID's proxy rewrites — the challenge is served from this
   origin so ad blockers and third-party script blockers cannot quietly disable
   it. It adds rewrites only; no route's render mode changes. */
export default withBotId(nextConfig);
