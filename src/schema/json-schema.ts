import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
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
 * Uses zod-to-json-schema with Cosmio-specific extensions.
 */
export function toJsonSchema<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TPaths extends readonly [string, ...string[]],
>(model: ModelDefinition<TSchema, TPaths>): CosmioJsonSchema {
  const base = zodToJsonSchema(model.schema, {
    name: model.name,
    target: "jsonSchema2019-09",
  });

  // zod-to-json-schema wraps in definitions/$defs + $ref — flatten for standalone use
  let schema: Record<string, unknown>;
  if ("definitions" in base && "$ref" in base) {
    schema = {
      ...((base.definitions as Record<string, unknown>)[model.name] as Record<string, unknown>),
    };
  } else if ("$defs" in base && "$ref" in base) {
    schema = {
      ...((base.$defs as Record<string, unknown>)[model.name] as Record<string, unknown>),
    };
  } else {
    schema = { ...base };
  }

  return {
    $schema: "https://json-schema.org/draft/2019-09/schema",
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
