import type { z } from "zod";

/**
 * Strip leading "/" from a partition key path.
 * "/tenantId" → "tenantId"
 */
export type StripSlash<P extends string> = P extends `/${infer K}` ? K : P;

/**
 * Extract the Zod-inferred type for a given partition key path from a schema.
 */
export type PathValue<TSchema extends z.ZodTypeAny, TPath extends string> =
  TSchema extends z.ZodObject<infer Shape extends z.ZodRawShape>
    ? StripSlash<TPath> extends keyof Shape
      ? z.infer<Shape[StripSlash<TPath>]>
      : never
    : never;

/**
 * Map an array of PK paths to a tuple of their inferred types.
 * ["/tenantId", "/siteId"] + schema → [string, string]
 */
export type PartitionKeyValues<TSchema extends z.ZodTypeAny, TPaths extends readonly string[]> = {
  [K in keyof TPaths]: PathValue<TSchema, TPaths[K] & string>;
};

/**
 * Extract partition key field names from paths.
 * ["/tenantId", "/siteId"] → ["tenantId", "siteId"]
 */
export type PartitionKeyFields<TPaths extends readonly string[]> = {
  [K in keyof TPaths]: StripSlash<TPaths[K] & string>;
};
