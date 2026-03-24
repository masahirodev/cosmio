import type { ContainerRequest, Database } from "@azure/cosmos";
import type { z } from "zod";
import type { ModelDefinition } from "../model/model-types.js";

/**
 * Build a partition key definition compatible with both @azure/cosmos v3 and v4.
 * Uses Record<string, unknown> to bypass v3/v4 type differences for `kind`.
 */
function buildPartitionKeyDef(paths: string[]): Record<string, unknown> {
  const def: Record<string, unknown> = {
    paths: [...paths],
    kind: paths.length > 1 ? "MultiHash" : "Hash",
  };
  if (paths.length > 1) def.version = 2;
  return def;
}

export interface EnsureContainerOptions {
  /** Fixed throughput (RU/s). Mutually exclusive with maxThroughput. */
  throughput?: number;
  /** Autoscale max throughput (RU/s). Mutually exclusive with throughput. */
  maxThroughput?: number;
}

/**
 * Ensure a Cosmos DB container exists for the given model.
 * Creates the container if it doesn't exist, applying all settings
 * from the model definition (partition key, indexing, TTL, unique keys, etc.).
 */
export async function ensureContainer<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TPaths extends readonly [string, ...string[]],
>(
  database: Database,
  model: ModelDefinition<TSchema, TPaths>,
  options?: EnsureContainerOptions,
): Promise<void> {
  const partitionKeyPaths = model.partitionKey as unknown as string[];
  const containerDef = {
    id: model.container,
    partitionKey: buildPartitionKeyDef(partitionKeyPaths),
  } as unknown as ContainerRequest;

  if (model.indexingPolicy) {
    containerDef.indexingPolicy = model.indexingPolicy;
  }

  if (model.defaultTtl !== undefined) {
    containerDef.defaultTtl = model.defaultTtl;
  }

  if (model.uniqueKeyPolicy) {
    containerDef.uniqueKeyPolicy = model.uniqueKeyPolicy;
  }

  if (model.conflictResolutionPolicy) {
    containerDef.conflictResolutionPolicy = model.conflictResolutionPolicy;
  }

  const requestOptions: Record<string, unknown> = {};

  if (options?.maxThroughput) {
    requestOptions.offerThroughput = undefined;
    containerDef.maxThroughput = options.maxThroughput;
  } else if (options?.throughput) {
    requestOptions.offerThroughput = options.throughput;
  }

  await database.containers.createIfNotExists(containerDef, requestOptions);
}

/**
 * Ensure containers for multiple models.
 * Deduplicates by container name — if multiple models share a container,
 * the first model's settings are used.
 *
 * Throws an error if models sharing a container have conflicting settings
 * (indexingPolicy, defaultTtl, uniqueKeyPolicy, conflictResolutionPolicy).
 */
export async function ensureContainers(
  database: Database,
  models: ModelDefinition<z.ZodObject<z.ZodRawShape>, readonly [string, ...string[]]>[],
  options?: EnsureContainerOptions,
): Promise<void> {
  const seen = new Map<
    string,
    ModelDefinition<z.ZodObject<z.ZodRawShape>, readonly [string, ...string[]]>
  >();
  for (const model of models) {
    const existing = seen.get(model.container);
    if (existing) {
      // Check for conflicting settings
      const conflicts: string[] = [];
      if (JSON.stringify(existing.partitionKey) !== JSON.stringify(model.partitionKey)) {
        conflicts.push("partitionKey");
      }
      if (JSON.stringify(existing.indexingPolicy) !== JSON.stringify(model.indexingPolicy)) {
        conflicts.push("indexingPolicy");
      }
      if (existing.defaultTtl !== model.defaultTtl) {
        conflicts.push("defaultTtl");
      }
      if (JSON.stringify(existing.uniqueKeyPolicy) !== JSON.stringify(model.uniqueKeyPolicy)) {
        conflicts.push("uniqueKeyPolicy");
      }
      if (
        JSON.stringify(existing.conflictResolutionPolicy) !==
        JSON.stringify(model.conflictResolutionPolicy)
      ) {
        conflicts.push("conflictResolutionPolicy");
      }
      if (conflicts.length > 0) {
        throw new Error(
          `Models "${existing.name}" and "${model.name}" share container "${model.container}" ` +
            `but have conflicting settings: [${conflicts.join(", ")}]. ` +
            `Shared containers must use identical container-level configuration.`,
        );
      }
      continue;
    }
    seen.set(model.container, model);
    await ensureContainer(database, model, options);
  }
}
