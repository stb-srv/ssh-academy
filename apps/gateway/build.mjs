// Bündelt das Gateway in eine einzige Datei (inkl. Workspace-Paketen), damit das Docker-Image klein bleibt.
import { build } from "esbuild";

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // Optionale native Beschleuniger von ssh2: ohne sie nutzt ssh2 reines JavaScript
  external: ["cpu-features", "*.node"],
  // ssh2 ist CommonJS und nutzt require und __dirname
  banner: {
    js: [
      "import { createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __pathDirname } from 'node:path';",
      "const require = createRequire(import.meta.url);",
      "const __filename = __fileURLToPath(import.meta.url);",
      "const __dirname = __pathDirname(__filename);",
    ].join(" "),
  },
  logLevel: "info",
});
