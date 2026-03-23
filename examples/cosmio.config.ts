/**
 * Example cosmio.config.ts for the `cosmio pull` command.
 *
 * Place this file in your project root and run:
 *   npx cosmio pull
 *
 * Connection info can come from:
 *   1. This config file (process.env is available)
 *   2. CLI args (--endpoint, --key, etc.)
 *   3. Environment variables (COSMOS_ENDPOINT, COSMOS_KEY, etc.)
 *
 * Use with dotenvx:
 *   dotenvx run -- npx cosmio pull
 */
import { defineConfig } from "cosmio";

export default defineConfig({
  connection: {
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY,
    database: "mydb",
    // disableTls: true,  // Uncomment for Cosmos DB emulator
  },
  pull: [
    // Simple: one model per container
    {
      container: "users",
      output: "src/models/user.model.ts",
      sampleSize: 100,
    },

    // Multi-model container: use WHERE to filter by discriminator
    {
      container: "documents",
      where: "c.type = 'article'",
      name: "Article",
      output: "src/models/article.model.ts",
    },
    {
      container: "documents",
      where: "c.type = 'checklist'",
      name: "Checklist",
      output: "src/models/checklist.model.ts",
    },

    // Custom options
    {
      container: "events",
      output: "src/models/event.model.ts",
      sampleSize: 500, // Sample more docs for better type inference
      enumThreshold: 20, // Allow up to 20 distinct values for enum detection
    },
  ],
});
