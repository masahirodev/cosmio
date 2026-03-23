#!/usr/bin/env node
/**
 * Test compatibility with multiple @azure/cosmos versions.
 *
 * Usage:
 *   npm run test:compat          # test v3 + v4
 *   npm run test:compat -- 3     # test v3 only
 *   npm run test:compat -- 4     # test v4 only
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const VERSIONS = {
  3: "3.17.2",
  4: "4",
};

const requested = process.argv[2];
const targets = requested ? { [requested]: VERSIONS[requested] } : VERSIONS;

if (requested && !VERSIONS[requested]) {
  console.error(
    `Unknown version: ${requested}. Available: ${Object.keys(VERSIONS).join(", ")}`,
  );
  process.exit(1);
}

// Save original package.json to restore later
const pkgPath = new URL("../package.json", import.meta.url).pathname;
const originalPkg = readFileSync(pkgPath, "utf-8");

const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { stdio: "inherit" });
  } catch {
    return false;
  }
  return true;
};

let failed = false;

try {
  for (const [ver, pkg] of Object.entries(targets)) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  @azure/cosmos v${ver} (${pkg})`);
    console.log(`${"=".repeat(60)}\n`);

    console.log("Installing...");
    run("npm", [
      "install",
      `@azure/cosmos@${pkg}`,
      "--save-dev",
      "--no-audit",
      "--no-fund",
      "--silent",
    ]);

    console.log("\n--- typecheck ---");
    if (!run("npx", ["tsc", "--noEmit"])) failed = true;

    console.log("\n--- unit tests ---");
    if (!run("npx", ["vitest", "run"])) failed = true;

    console.log("\n--- build ---");
    if (!run("npx", ["tsup"])) failed = true;
  }
} finally {
  // Always restore original package.json
  console.log("\n--- Restoring original dependencies ---");
  writeFileSync(pkgPath, originalPkg);
  run("npm", ["install", "--silent", "--no-audit", "--no-fund"]);
}

if (failed) {
  console.error("\nSome checks failed.");
  process.exit(1);
} else {
  console.log("\nAll checks passed for all versions.");
}
