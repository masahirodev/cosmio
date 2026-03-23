/**
 * Configuration for a single pull target (one model per container or WHERE filter).
 */
export interface PullTarget {
  /** Cosmos DB container name */
  container: string;
  /** Model name (default: PascalCase of container name) */
  name?: string;
  /** Output file path (default: stdout) */
  output?: string;
  /** Number of documents to sample (default: 100) */
  sampleSize?: number;
  /** WHERE filter for multi-model containers (e.g., "c.type = 'article'") */
  where?: string;
  /** Max distinct values to treat as enum (default: 10) */
  enumThreshold?: number;
}

/**
 * Connection options for Cosmos DB.
 */
export interface CosmioConnectionConfig {
  /** Cosmos DB endpoint URL */
  endpoint?: string;
  /** Cosmos DB account key */
  key?: string;
  /** Cosmos DB connection string (alternative to endpoint+key) */
  connectionString?: string;
  /** Database name */
  database: string;
  /** Disable TLS verification (for emulator) */
  disableTls?: boolean;
}

/**
 * Cosmio configuration file schema.
 *
 * @example
 * ```ts
 * // cosmio.config.ts
 * import { defineConfig } from "cosmio";
 *
 * export default defineConfig({
 *   connection: {
 *     endpoint: process.env.COSMOS_ENDPOINT,
 *     key: process.env.COSMOS_KEY,
 *     database: "mydb",
 *   },
 *   pull: [
 *     { container: "users", output: "src/models/user.model.ts" },
 *   ],
 * });
 * ```
 */
export interface CosmioConfig {
  /** Cosmos DB connection settings */
  connection: CosmioConnectionConfig;
  /** Pull targets for model generation */
  pull?: PullTarget[];
}

/**
 * Define a Cosmio configuration with full type safety.
 * Use this in `cosmio.config.ts` for IDE autocomplete.
 */
export function defineConfig(config: CosmioConfig): CosmioConfig {
  return config;
}
