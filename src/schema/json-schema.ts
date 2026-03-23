import type { z } from "zod";
import type { ModelDefinition } from "../model/model-types.js";

export interface CosmioJsonSchema {
  $schema: string;
  title: string;
  description?: string;
  "x-cosmio-container": string;
  "x-cosmio-partition-key": readonly string[];
  "x-cosmio-discriminator"?: {
    field: string;
    value: string;
  };
  [key: string]: unknown;
}

/**
 * Generate a JSON Schema from a model definition.
 * Uses Zod v4's native toJSONSchema() with Cosmio-specific extensions.
 */
export function toJsonSchema<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TPaths extends readonly [string, ...string[]],
>(model: ModelDefinition<TSchema, TPaths>): CosmioJsonSchema {
  const schema = (
    model.schema as unknown as { toJSONSchema(): Record<string, unknown> }
  ).toJSONSchema();

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: model.name,
    ...(model.description !== undefined ? { description: model.description } : {}),
    "x-cosmio-container": model.container,
    "x-cosmio-partition-key": model.partitionKey,
    ...(model.discriminator ? { "x-cosmio-discriminator": model.discriminator } : {}),
    ...schema,
  };
}

/**
 * Generate JSON Schema for multiple models, keyed by model name.
 */
export function toJsonSchemas(
  models: ModelDefinition<z.ZodObject<z.ZodRawShape>, readonly [string, ...string[]]>[],
): Record<string, CosmioJsonSchema> {
  const result: Record<string, CosmioJsonSchema> = {};
  for (const model of models) {
    result[model.name] = toJsonSchema(model);
  }
  return result;
}
