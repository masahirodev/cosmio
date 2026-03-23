import { createHash } from "node:crypto";
import { CosmosClient } from "@azure/cosmos";
import type { z } from "zod";
import type { MigrationRegistry } from "../migration/migration-registry.js";
import type { DefaultsMap, ModelDefinition } from "../model/model-types.js";
import { CosmioContainer } from "./cosmio-container.js";
import { TransactionBuilder } from "./transaction.js";

export interface CosmioClientOptions {
  /** Cosmos DB connection options */
  cosmos:
    | { endpoint: string; key: string }
    | { connectionString: string }
    | { client: CosmosClient };
  /** Database name */
  database: string;
  /** Global migration registry — applied to all reads across all models */
  migrations?: MigrationRegistry;
}

/**
 * Resolve a stable cache key from connection options.
 * Returns undefined if a pre-built CosmosClient is passed (user manages lifecycle).
 */
function resolveInstanceKey(options: CosmioClientOptions): string | undefined {
  if ("client" in options.cosmos) {
    return undefined;
  }
  const connId =
    "connectionString" in options.cosmos
      ? options.cosmos.connectionString
      : `${options.cosmos.endpoint}::${options.cosmos.key}`;
  // Hash to avoid storing raw connection strings (which may contain keys) in memory
  return hashKey(`${connId}::${options.database}`);
}

function hashKey(str: string): string {
  return createHash("sha256").update(str).digest("hex");
}

/**
 * Main client for Cosmio. Wraps CosmosClient and provides type-safe model binding.
 *
 * Azure Cosmos DB recommends using a single CosmosClient instance per application
 * because each instance maintains its own TCP connection pool.
 * CosmioClient enforces this by default — calling `new CosmioClient(...)` with the
 * same endpoint + database returns the **same instance** (singleton per connection).
 *
 * To opt out (e.g. for tests), pass `{ singleton: false }` as the second argument
 * or provide a pre-built `CosmosClient` via `{ cosmos: { client } }`.
 */
export class CosmioClient {
  private static readonly _instances = new Map<string, CosmioClient>();

  private readonly _cosmosClient!: CosmosClient;
  private readonly _databaseId!: string;
  private readonly _migrations: MigrationRegistry | undefined;
  private readonly _containerCache = new Map<string, CosmioContainer<never, never>>();

  constructor(options: CosmioClientOptions, opts?: { singleton?: boolean }) {
    const singleton = opts?.singleton ?? true;
    const key = singleton ? resolveInstanceKey(options) : undefined;

    if (key) {
      const existing = CosmioClient._instances.get(key);
      if (existing) {
        // biome-ignore lint/correctness/noConstructorReturn: Singleton pattern — intentional constructor return
        return existing;
      }
    }

    this._databaseId = options.database;
    this._migrations = options.migrations;

    if ("client" in options.cosmos) {
      this._cosmosClient = options.cosmos.client;
    } else if ("connectionString" in options.cosmos) {
      this._cosmosClient = new CosmosClient(options.cosmos.connectionString);
    } else {
      this._cosmosClient = new CosmosClient({
        endpoint: options.cosmos.endpoint,
        key: options.cosmos.key,
      });
    }

    if (key) {
      CosmioClient._instances.set(key, this);
    }
  }

  /**
   * Bind a model definition to get a type-safe container operations object.
   * The same model always returns the same CosmioContainer instance.
   */
  model<
    TSchema extends z.ZodObject<z.ZodRawShape>,
    TPaths extends readonly [string, ...string[]],
    TDefaults extends DefaultsMap<TSchema> = DefaultsMap<TSchema>,
  >(
    definition: ModelDefinition<TSchema, TPaths, TDefaults>,
  ): CosmioContainer<TSchema, TPaths, TDefaults> {
    const cacheKey = `${definition.container}::${definition.name}`;
    const cached = this._containerCache.get(cacheKey);
    if (cached) {
      return cached as unknown as CosmioContainer<TSchema, TPaths, TDefaults>;
    }

    const container = this._cosmosClient.database(this._databaseId).container(definition.container);

    const cosmioContainer = new CosmioContainer(container, definition, this._migrations);
    this._containerCache.set(cacheKey, cosmioContainer as unknown as CosmioContainer<never, never>);
    return cosmioContainer;
  }

  /**
   * Access the underlying CosmosClient.
   */
  get raw(): CosmosClient {
    return this._cosmosClient;
  }

  /**
   * Access the underlying database reference.
   */
  get database() {
    return this._cosmosClient.database(this._databaseId);
  }

  /**
   * Create a transactional batch for atomic operations within a single partition.
   * All operations succeed or fail together — no partial commits.
   *
   * **Note:** This is a low-level API that bypasses model features:
   * - Soft delete is NOT respected — `tx.delete()` always physically deletes
   * - Zod validation is NOT applied — you must validate inputs yourself
   * - Lifecycle hooks are NOT fired
   *
   * @example
   * ```ts
   * await client.transaction("my-container", ["tenantId-value"], (tx) => {
   *   tx.create({ id: "1", tenantId: "t1", ... });
   *   tx.patch("2", [{ op: "replace", path: "/status", value: "done" }]);
   *   tx.delete("3");
   * });
   * ```
   */
  async transaction(
    containerName: string,
    partitionKeyValues: readonly unknown[],
    build: (tx: TransactionBuilder) => void,
  ): Promise<void> {
    const container = this._cosmosClient.database(this._databaseId).container(containerName);
    const pk = partitionKeyValues.length === 1 ? partitionKeyValues[0] : [...partitionKeyValues];
    const tx = new TransactionBuilder(container, pk);
    build(tx);
    await tx.execute();
  }

  /**
   * Remove this instance from the singleton cache and allow it to be garbage collected.
   * Call this when shutting down the application or in test teardown.
   */
  dispose(): void {
    for (const [key, instance] of CosmioClient._instances) {
      if (instance === this) {
        CosmioClient._instances.delete(key);
        break;
      }
    }
    this._containerCache.clear();
  }

  /**
   * Clear all cached singleton instances. Primarily for testing.
   */
  static resetInstances(): void {
    CosmioClient._instances.clear();
  }
}
