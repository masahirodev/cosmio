/**
 * Load cosmio.config.ts from the current working directory.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CosmioConfig } from "./define-config.js";

const CONFIG_FILENAMES = ["cosmio.config.ts", "cosmio.config.js", "cosmio.config.mjs"];

/**
 * Attempt to load cosmio.config.ts (or .js/.mjs) from cwd.
 * Returns undefined if no config file is found.
 */
export async function loadConfig(cwd?: string): Promise<CosmioConfig | undefined> {
  const baseDir = cwd ?? process.cwd();

  for (const filename of CONFIG_FILENAMES) {
    const configPath = resolve(baseDir, filename);
    if (!existsSync(configPath)) continue;

    const fileUrl = pathToFileURL(configPath).href;
    const mod = await import(fileUrl);
    const config = mod.default ?? mod;

    if (config && typeof config === "object" && "connection" in config) {
      return config as CosmioConfig;
    }
  }

  return undefined;
}
