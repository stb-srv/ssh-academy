import path from "node:path";
import createMDX from "@next/mdx";
import type { NextConfig } from "next";

// HSTS setzt der Reverse Proxy (Caddy), weil nur er weiß, ob HTTPS aktiv ist.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo: Abhängigkeiten aus dem Wurzelverzeichnis mit ins Standalone-Bundle aufnehmen
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  poweredByHeader: false,
  transpilePackages: ["@ssh-academy/db"],
  serverExternalPackages: ["@node-rs/argon2"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withMDX = createMDX({
  options: {
    // Als String angegeben, damit es auch mit Turbopack funktioniert
    remarkPlugins: ["remark-gfm"],
  },
});

export default withMDX(nextConfig);
