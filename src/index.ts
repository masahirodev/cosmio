// Model definition

export { generateAdvisorPrompt } from "./advisor/ai-prompt.js";
// Advisor
export { analyze as analyzeModels } from "./advisor/analyzer.js";
export { DESIGN_PATTERNS, getPatternInfo, recommendPattern } from "./advisor/design-patterns.js";
export type {
  AccessPattern,
  AdvisorCategory,
  AdvisorFinding,
  AdvisorReport,
  CosmosDesignPattern,
  CostBreakdown,
  DesignPatternRecommendation,
  ModelWithPatterns,
  RUEstimate,
  Severity,
} from "./advisor/types.js";
export { ReadCache } from "./client/cache.js";
export type { CosmioClientOptions } from "./client/cosmio-client.js";
// Client
export { CosmioClient } from "./client/cosmio-client.js";
export type { BulkOperation } from "./client/cosmio-container.js";
export { CosmioContainer } from "./client/cosmio-container.js";
export type { HookEvent, HookFn } from "./client/hooks.js";
export { HookRegistry } from "./client/hooks.js";
export type { WithMetrics } from "./client/metrics.js";
export type { DtoQueryBuilder, ProjectedQueryBuilder } from "./client/query-builder.js";
export { QueryBuilder } from "./client/query-builder.js";
export { TransactionBuilder } from "./client/transaction.js";
export type { CosmioErrorCode } from "./errors/index.js";
// Errors
export {
  ConflictError,
  CosmioError,
  mapCosmosError,
  NotFoundError,
  PreconditionFailedError,
  TooManyRequestsError,
  ValidationError,
} from "./errors/index.js";
export type { CosmioInvocationContext } from "./integrations/azure-functions.js";
// Azure Functions integration
export {
  cosmioHooks,
  cosmioV3,
  getCosmioContext,
  getInvocationCache,
  withCosmioContext,
} from "./integrations/azure-functions.js";
export type { Migration } from "./migration/migration-registry.js";
// Migration
export { MigrationRegistry } from "./migration/migration-registry.js";
export { defineModel } from "./model/define-model.js";
export type { DtoModelOverride, DtoPolicyConfig } from "./model/dto-policy.js";
// DTO Policy
export { defineDtoPolicy, DtoPolicy } from "./model/dto-policy.js";
export type {
  CreateInputWithDefaults,
  DefaultsMap,
  DefaultValue,
  Discriminator,
  DtoMap,
  DtoRule,
  ResolveDtoMap,
  ResolveDtoRule,
  ModelConfig,
  ModelDefinition,
} from "./model/model-types.js";
// Repository
export { defineRepository } from "./model/repository.js";
export type { CosmioJsonSchema } from "./schema/json-schema.js";
// Schema generation
export { toJsonSchema, toJsonSchemas } from "./schema/json-schema.js";
export { toMarkdown, toMarkdownDoc } from "./schema/markdown.js";
export type { MermaidOptions } from "./schema/mermaid.js";
export { toMermaidER } from "./schema/mermaid.js";
export { toOpenAPI } from "./schema/openapi.js";
export type { CreateInput, DocumentRead, ModelOutput } from "./types/inference.js";
// Types
export type {
  PartitionKeyFields,
  PartitionKeyValues,
  PathValue,
  StripSlash,
} from "./types/partition-key.js";
export type { CosmosSystemFields, WithSystemFields } from "./types/system-fields.js";
export type {
  BooleanFilter,
  NumberFilter,
  StringFilter,
  WhereInput,
} from "./types/where.js";
export { ensureContainer, ensureContainers } from "./utils/container-setup.js";
// Utilities
export { buildPartitionKey, extractPartitionKey } from "./utils/partition-key.js";
export { extractDescriptions } from "./utils/schema-descriptions.js";
// Config
export type { CosmioConfig, CosmioConnectionConfig, PullTarget } from "./config/define-config.js";
export { defineConfig } from "./config/define-config.js";
// Introspect
export type {
  InferredField,
  InferredSchema,
  InferredType,
  ContainerMetadata,
  PullResult,
} from "./introspect/index.js";
export { inferSchema, generateModelSource, toPascalCase, pull } from "./introspect/index.js";
