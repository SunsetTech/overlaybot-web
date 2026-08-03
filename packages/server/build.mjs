// packages/server/build.mjs
import * as esbuild from "esbuild"

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22", // match your Node version
  format: "cjs",     // or "cjs" if you dropped "type": "module"
  outfile: "dist/index.js",
  packages: "bundle", // bundle everything, including workspace deps like @overlaybot/shared
})
