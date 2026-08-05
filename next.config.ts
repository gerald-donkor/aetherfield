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

export default nextConfig;
