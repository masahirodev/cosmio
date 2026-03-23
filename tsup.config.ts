import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "bin/cosmio.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
  outDir: "dist",
  splitting: false,
  external: ["zod", "@azure/cosmos"],
});
