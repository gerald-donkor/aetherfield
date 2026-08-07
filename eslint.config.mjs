import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // License-gated, generated vendor docs; lint project-owned skill code only.
    ".agents/skills/tailwind-4-docs/references/docs/**",
    ".agents/skills/tailwind-4-docs/references/docs-index.tsx",
  ]),
]);

export default eslintConfig;
