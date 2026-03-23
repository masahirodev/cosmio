import type { z } from "zod";
import type { ModelDefinition } from "../model/model-types.js";
import type { PartitionKeyValues } from "../types/partition-key.js";

/**
 * Strip the leading "/" from a partition key path.
 */
function stripSlash(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

/**
 * Extract partition key values from a document based on the model's PK paths.
 *
 * @example
 * ```ts
 * const pk = extractPartitionKey(InspectionModel, doc);
 * // → ["t1", "s1"]
 * ```
 */
export function extractPartitionKey<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TPaths extends readonly [string, ...string[]],
>(
  // biome-ignore lint/suspicious/noExplicitAny: defaults/dto are irrelevant for PK extraction
  model: ModelDefinition<TSchema, TPaths, any, any>,
  document: Record<string, unknown>,
): PartitionKeyValues<TSchema, TPaths> {
  return model.partitionKey.map((path) => {
    const field = stripSlash(path);
    const value = document[field];
    if (value === undefined) {
      throw new Error(`Partition key field "${field}" is missing from document`);
    }
    return value;
  }) as unknown as PartitionKeyValues<TSchema, TPaths>;
}

/**
 * Build a Cosmos DB PartitionKey from a values tuple.
 * Handles single (primitive) and hierarchical (array) partition keys.
 */
export function buildPartitionKey(values: readonly unknown[]): unknown {
  if (values.length === 1) {
    return values[0];
  }
  return [...values];
}
