import type { ConflictResolutionPolicy, IndexingPolicy, UniqueKeyPolicy } from "@azure/cosmos";
import type { z } from "zod";
import type { DocumentRead, ModelOutput } from "../types/inference.js";
import type { PartitionKeyValues } from "../types/partition-key.js";

/**
 * Discriminator configuration for multi-model containers.
 */
export interface Discriminator {
  /** The field name used to discriminate document types */
  field: string;
  /** The value that identifies this model's documents */
  value: string;
}

/**
 * A default value: either a static value or a factory function called on each write.
 */
export type DefaultValue<T> = T | (() => T);

/**
 * Map of field names to their default values.
 * Only fields that exist in the schema can have defaults.
 */
export type DefaultsMap<TSchema extends z.ZodObject<z.ZodRawShape>> = {
  [K in keyof z.infer<TSchema>]?: DefaultValue<z.infer<TSchema>[K]>;
};

/**
 * A single DTO rule: either omit (blocklist) or pick (allowlist).
 */
export type DtoRule<TSchema extends z.ZodObject<z.ZodRawShape>> =
  | { omit: readonly (keyof z.infer<TSchema>)[]; pick?: never }
  | { pick: readonly (keyof z.infer<TSchema>)[]; omit?: never };

/**
 * Named DTO configurations map.
 * Each key is a DTO name (e.g., "api", "admin", "public").
 */
export type DtoMap<TSchema extends z.ZodObject<z.ZodRawShape>> = {
  [name: string]: DtoRule<TSchema>;
};

/**
 * Resolve the output type for a single DTO rule.
 */
export type ResolveDtoRule<TSchema extends z.ZodObject<z.ZodRawShape>, TRule> = TRule extends {
  omit: readonly (infer K)[];
}
  ? Omit<z.infer<TSchema>, K & keyof z.infer<TSchema>>
  : TRule extends { pick: readonly (infer K)[] }
    ? Pick<z.infer<TSchema>, K & keyof z.infer<TSchema>>
    : z.infer<TSchema>;

/**
 * Resolve all named DTOs in a map to their output types.
 */
export type ResolveDtoMap<TSchema extends z.ZodObject<z.ZodRawShape>, TDtoMap> = {
  [K in keyof TDtoMap]: ResolveDtoRule<TSchema, TDtoMap[K]>;
};

/**
 * Configuration passed to defineModel().
 */
export interface ModelConfig<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TPaths extends readonly [string, ...string[]],
  TDefaults extends DefaultsMap<TSchema> = DefaultsMap<TSchema>,
  TDtoMap extends DtoMap<TSchema> = Record<string, never>,
> {
  /** Human-readable model name */
  name: string;
  /** Cosmos DB container name */
  container: string;
  /** Partition key paths (e.g., ["/tenantId", "/siteId"]) */
  partitionKey: TPaths;
  /** Zod schema for the document */
  schema: TSchema;
  /**
   * Default values for fields. Static values or factory functions.
   * Fields with defaults become optional in create/upsert input.
   *
   * @example
   * ```ts
   * defaults: {
   *   type: "inspection",                         // static
   *   createdAt: () => new Date().toISOString(),   // factory (called on each write)
   *   status: "draft",
   * }
   * ```
   */
  defaults?: TDefaults;
  /**
   * Named DTO configurations for automatic field masking on output.
   * Each entry defines a named projection with either `omit` (blocklist)
   * or `pick` (allowlist). Use `model.toDto(name, doc)` at runtime.
   *
   * @example
   * ```ts
   * dto: {
   *   api: { omit: ["passwordHash", "internalScore"] as const },
   *   admin: { omit: ["passwordHash"] as const },
   *   public: { pick: ["id", "name"] as const },
   * }
   * ```
   */
  dto?: TDtoMap;
  /**
   * Migrate raw documents on read. Called before Zod validation (if validateOnRead is enabled).
   * Use this for app-level schema migration since Cosmos DB has no built-in migration.
   *
   * @example
   * ```ts
   * migrate: (raw) => {
   *   // v1 → v2: rename "firstName"+"lastName" to "fullName"
   *   if (raw.firstName && !raw.fullName) {
   *     raw.fullName = `${raw.firstName} ${raw.lastName}`;
   *     delete raw.firstName;
   *     delete raw.lastName;
   *   }
   *   // v2 → v3: add default role
   *   if (!raw.role) {
   *     raw.role = "member";
   *   }
   *   return raw;
   * }
   * ```
   */
  migrate?: (raw: Record<string, unknown>) => Record<string, unknown>;
  /**
   * Whether to run Zod validation on read (after migrate).
   * Defaults to false for performance. Enable if you want strict validation on reads.
   */
  validateOnRead?: boolean;
  /** Optional indexing policy (Cosmos DB format) */
  indexingPolicy?: IndexingPolicy;
  /** Default TTL in seconds (-1 = enabled without default, positive = expire after N seconds) */
  defaultTtl?: number;
  /** Unique key policy for cross-field uniqueness within a partition */
  uniqueKeyPolicy?: UniqueKeyPolicy;
  /** Conflict resolution policy (for multi-region write) */
  conflictResolutionPolicy?: ConflictResolutionPolicy;
  /**
   * Soft delete configuration. When enabled, `delete()` sets a timestamp field
   * instead of physically removing the document. Queries auto-exclude deleted docs.
   * Combine with `defaultTtl` to auto-purge after a retention period.
   */
  softDelete?: {
    /** Field name to store deletion timestamp (e.g., "deletedAt") */
    field: string;
    /** Auto-exclude deleted docs from find/query (default: true) */
    autoExclude?: boolean;
  };
  /** Optional discriminator for multi-model containers */
  discriminator?: Discriminator;
  /** Optional description for documentation */
  description?: string;
}

/**
 * Make keys in TDefaultKeys optional in T.
 */
type WithOptionalDefaults<T, TDefaultKeys extends keyof T> = Omit<T, TDefaultKeys> &
  Partial<Pick<T, TDefaultKeys>>;

/**
 * The input type for create/upsert, with default fields made optional.
 */
export type CreateInputWithDefaults<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TDefaults extends DefaultsMap<TSchema>,
> = WithOptionalDefaults<z.input<TSchema>, keyof TDefaults & keyof z.input<TSchema>>;

/**
 * Runtime DTO schemas map stored on the model definition.
 */
export type DtoSchemas = Record<string, z.ZodObject<z.ZodRawShape>>;

/**
 * The frozen object returned by defineModel().
 * _types exists only at the type level for inference.
 */
export interface ModelDefinition<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TPaths extends readonly [string, ...string[]],
  TDefaults extends DefaultsMap<TSchema> = DefaultsMap<TSchema>,
  TDtoMap extends DtoMap<TSchema> = Record<string, never>,
> {
  readonly name: string;
  readonly container: string;
  readonly partitionKey: TPaths;
  readonly schema: TSchema;
  readonly defaults: TDefaults;
  readonly migrate?: (raw: Record<string, unknown>) => Record<string, unknown>;
  readonly validateOnRead: boolean;
  readonly softDelete?: { field: string; autoExclude: boolean };
  readonly indexingPolicy?: IndexingPolicy;
  readonly defaultTtl?: number;
  readonly uniqueKeyPolicy?: UniqueKeyPolicy;
  readonly conflictResolutionPolicy?: ConflictResolutionPolicy;
  readonly discriminator?: Discriminator;
  readonly description?: string;

  /** Field descriptions extracted from Zod .describe() */
  readonly fieldDescriptions: Record<string, string | undefined>;

  /** Runtime DTO Zod schemas keyed by DTO name */
  readonly dtoSchemas: DtoSchemas;

  /**
   * Convert a document to a named DTO, stripping/picking fields as configured.
   * Uses Zod `.parse()` internally so extra fields are always stripped.
   */
  toDto<K extends string & keyof TDtoMap>(
    name: K,
    doc: Record<string, unknown>,
  ): ResolveDtoRule<TSchema, TDtoMap[K]>;

  /** Type-level only. Do not access at runtime. */
  readonly _types: {
    readonly input: CreateInputWithDefaults<TSchema, TDefaults>;
    readonly output: ModelOutput<TSchema>;
    readonly document: DocumentRead<TSchema>;
    readonly partitionKeyValues: PartitionKeyValues<TSchema, TPaths>;
    readonly dto: ResolveDtoMap<TSchema, TDtoMap>;
  };
}
