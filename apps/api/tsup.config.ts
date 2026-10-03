import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/release.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  sourcemap: true,
  // Bundle everything (workspace packages ship TS source) so the runtime image needs no node_modules.
  noExternal: [/.*/],
  // Lets bundled CommonJS dependencies call require() from inside the ESM bundle.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
})
