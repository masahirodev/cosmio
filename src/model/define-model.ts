import type { z } from "zod";
import { extractDescriptions } from "../utils/schema-descriptions.js";
import type {
  DefaultsMap,
  DtoMap,
  DtoSchemas,
  ModelConfig,
  ModelDefinition,
} from "./model-types.js";

const SAFE_FIELD_NAME = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
function assertSafeField(field: string, label: string, model: string): void {
  if (!SAFE_FIELD_NAME.test(field)) {
    throw new Error(`${label} "${field}" in model "${model}" contains invalid characters`);
  }
}

/**
 * Build Zod DTO schemas from the dto config map.
 * Each entry produces a derived ZodObject via .omit() or .pick().
 */
function buildDtoSchemas<TSchema extends z.ZodObject<z.ZodRawShape>>(
  schema: TSchema,
  dtoMap: DtoMap<TSchema> | undefined,
  modelName: string,
): DtoSchemas {
  if (!dtoMap) return {};
  const schemas: DtoSchemas = {};
  const shape = schema.shape;

  for (const [name, rule] of Object.entries(dtoMap)) {
    if (rule.omit) {
      // Validate omit fields exist in schema
      for (const field of rule.omit) {
        const fieldStr = String(field);
        if (!(fieldStr in shape)) {
          throw new Error(
            `DTO "${name}" omit field "${fieldStr}" is not defined in the schema for model "${modelName}"`,
          );
        }
      }
      const omitMask = Object.fromEntries(rule.omit.map((k) => [k, true as const]));
      schemas[name] = schema.omit(omitMask) as z.ZodObject<z.ZodRawShape>;
    } else if (rule.pick) {
      // Validate pick fields exist in schema
      for (const field of rule.pick) {
        const fieldStr = String(field);
        if (!(fieldStr in shape)) {
          throw new Error(
            `DTO "${name}" pick field "${fieldStr}" is not defined in the schema for model "${modelName}"`,
          );
        }
      }
      const pickMask = Object.fromEntries(rule.pick.map((k) => [k, true as const]));
      schemas[name] = schema.pick(pickMask) as z.ZodObject<z.ZodRawShape>;
    }
  }
  return schemas;
}

/**
 * Define a Cosmos DB model. Pure data definition — no DB connection required.
 *
 * @example
 * ```ts
 * const UserModel = defineModel({
 *   name: "User",
 *   container: "users",
 *   partitionKey: ["/tenantId"],
 *   schema: z.object({
 *     id: z.string(),
 *     tenantId: z.string(),
 *     name: z.string(),
 *     email: z.string(),
 *     passwordHash: z.string(),
 *     createdAt: z.string(),
 *   }),
 *   defaults: {
 *     createdAt: () => new Date().toISOString(),
 *   },
 *   dto: {
 *     api: { omit: ["passwordHash"] as const },
 *     public: { pick: ["id", "name"] as const },
 *   },
 * });
 *
 * // Type inference
 * type ApiUser = typeof UserModel._types.dto.api;
 * // → { id: string; tenantId: string; name: string; email: string; createdAt: string }
 *
 * // Runtime conversion
 * const apiUser = UserModel.toDto("api", doc);
 * ```
 */
export function defineModel<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  const TPaths extends readonly [string, ...string[]],
  const TDefaults extends DefaultsMap<TSchema> = Record<string, never>,
  const TDtoMap extends DtoMap<TSchema> = Record<string, never>,
>(
  config: ModelConfig<TSchema, TPaths, TDefaults, TDtoMap>,
): ModelDefinition<TSchema, TPaths, TDefaults, TDtoMap> {
  // Validate partition key paths format
  for (const path of config.partitionKey) {
    if (!path.startsWith("/")) {
      throw new Error(`Partition key path "${path}" must start with "/". Example: "/${path}"`);
    }
  }

  // Validate discriminator field exists in schema if specified
  if (config.discriminator) {
    const shape = config.schema.shape;
    const field = config.discriminator.field;
    assertSafeField(field, "Discriminator field", config.name);
    if (!(field in shape)) {
      throw new Error(
        `Discriminator field "${field}" is not defined in the schema for model "${config.name}"`,
      );
    }
  }

  // Validate partition key fields exist in schema
  const shape = config.schema.shape;
  for (const path of config.partitionKey) {
    const field = path.startsWith("/") ? path.slice(1) : path;
    if (!(field in shape)) {
      throw new Error(
        `Partition key field "${field}" (from path "${path}") is not defined in the schema for model "${config.name}"`,
      );
    }
  }

  // Validate softDelete field exists in schema
  if (config.softDelete) {
    assertSafeField(config.softDelete.field, "Soft delete field", config.name);
  }
  if (config.softDelete && !(config.softDelete.field in shape)) {
    throw new Error(
      `Soft delete field "${config.softDelete.field}" is not defined in the schema for model "${config.name}"`,
    );
  }

  // Validate defaults keys exist in schema
  if (config.defaults) {
    const shape = config.schema.shape;
    for (const key of Object.keys(config.defaults)) {
      if (!(key in shape)) {
        throw new Error(
          `Default key "${key}" is not defined in the schema for model "${config.name}"`,
        );
      }
    }
  }

  // Build DTO schemas (validates fields exist in schema)
  const dtoSchemas = buildDtoSchemas(config.schema, config.dto, config.name);

  const definition = {
    name: config.name,
    container: config.container,
    partitionKey: config.partitionKey,
    schema: config.schema,
    defaults: config.defaults ?? ({} as TDefaults),
    migrate: config.migrate,
    validateOnRead: config.validateOnRead ?? false,
    softDelete: config.softDelete
      ? { field: config.softDelete.field, autoExclude: config.softDelete.autoExclude ?? true }
      : undefined,
    indexingPolicy: config.indexingPolicy,
    defaultTtl: config.defaultTtl,
    uniqueKeyPolicy: config.uniqueKeyPolicy,
    conflictResolutionPolicy: config.conflictResolutionPolicy,
    discriminator: config.discriminator,
    description: config.description,
    fieldDescriptions: extractDescriptions(config.schema),
    dtoSchemas,
    toDto(name: string, doc: Record<string, unknown>) {
      const dtoSchema = dtoSchemas[name];
      if (!dtoSchema) {
        throw new Error(`DTO "${name}" is not defined in model "${config.name}"`);
      }
      return dtoSchema.parse(doc);
    },
  } as ModelDefinition<TSchema, TPaths, TDefaults, TDtoMap>;

  Object.defineProperty(definition, "_types", {
    get() {
      throw new Error(
        `"_types" is for type-level inference only and must not be accessed at runtime. ` +
          `Use typeof ${config.name}Model._types.output instead.`,
      );
    },
    enumerable: false,
    configurable: false,
  });

  return Object.freeze(definition);
}
