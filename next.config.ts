import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Repository guidance is maintained in AGENTS.md; do not rewrite it on dev startup.
  agentRules: false,
  // Type-check what the app ships: app/ plus everything it imports (lib/,
  // convex API types). Standalone tests, gate scripts and eval tooling are
  // checked by their own runners, not by the production build.
  typescript: { tsconfigPath: "tsconfig.app.json" },
};

export default nextConfig;
