# Feature Test Coverage Matrix

Comprehensive matrix of all cosmio features and their test coverage.

Legend: ✅ Tested | ❌ Not tested | — Not applicable

---

## CosmioClient

| Method | Unit | Integration | Test File |
|--------|------|-------------|-----------|
| `constructor()` (singleton) | ✅ | ✅ | cosmio-client.test.ts |
| `model()` | ✅ | ✅ | cosmio-client.test.ts |
| `raw` getter | ✅ | — | cosmio-client.test.ts |
| `database` getter | ✅ | — | cosmio-client.test.ts |
| `transaction()` | ✅ | — | transaction.test.ts |
| `dispose()` | ✅ | — | cosmio-client.test.ts |
| `resetInstances()` | ✅ | — | cosmio-client.test.ts |

## CosmioContainer — CRUD

| Method | Unit | Integration | Test File |
|--------|------|-------------|-----------|
| `create()` | ✅ | ✅ | cosmio-container.test.ts, crud.test.ts |
| `upsert()` | ✅ | ✅ | cosmio-container.test.ts, crud.test.ts |
| `findById()` | ✅ | ✅ | features.test.ts, crud.test.ts |
| `replace()` | ✅ | ✅ | cosmio-container.test.ts, crud.test.ts |
| `delete()` | ✅ | ✅ | features.test.ts, crud.test.ts |
| `hardDelete()` | ✅ | ✅ | features.test.ts, soft-delete.test.ts |
| `restore()` | ✅ | ✅ | features.test.ts, soft-delete.test.ts |
| `patch()` | ✅ | ✅ | features.test.ts, crud.test.ts |
| `query()` | ✅ | ✅ | cosmio-container.test.ts |
| `bulk()` | ✅ | ✅ | cosmio-container.test.ts, bulk.test.ts |

## CosmioContainer — Metrics

| Method | Unit | Integration | Test File |
|--------|------|-------------|-----------|
| `createWithMetrics()` | ✅ | ✅ | select-metrics-count.test.ts |
| `findByIdWithMetrics()` | ✅ | ✅ | select-metrics-count.test.ts, features.test.ts |
| `upsertWithMetrics()` | ✅ | — | select-metrics-count.test.ts |
| `deleteWithMetrics()` | ✅ | — | select-metrics-count.test.ts |

## CosmioContainer — Other

| Method | Unit | Integration | Test File |
|--------|------|-------------|-----------|
| `scope()` | ✅ | ✅ | features.test.ts, hooks-cache.test.ts |
| `find()` | ✅ | ✅ | query-builder.test.ts |
| `findWithDeleted()` | ✅ | ✅ | features.test.ts, soft-delete.test.ts |
| `use()` (hooks) | ✅ | ✅ | features.test.ts, hooks-cache.test.ts |
| `raw` getter | ✅ | — | cosmio-container.test.ts |

## QueryBuilder — SQL Generation

See [QUERY_COVERAGE.md](./QUERY_COVERAGE.md) for detailed SQL generation coverage.

| Method | Unit | Integration | Test File |
|--------|------|-------------|-----------|
| `where()` — classic | ✅ | ✅ | query-builder.test.ts |
| `where()` — Prisma style | ✅ | ✅ | query-builder.test.ts |
| `whereRaw()` | ✅ | ✅ | query-builder.test.ts |
| `orderBy()` | ✅ | ✅ | query-builder.test.ts |
| `limit()` | ✅ | ✅ | query-builder.test.ts |
| `offset()` | ✅ | — | query-builder.test.ts |
| `select()` | ✅ | ✅ | select-metrics-count.test.ts |
| `asDto()` | ✅ | — | query-builder-dto.test.ts |
| `count()` | ✅ | ✅ | select-metrics-count.test.ts |
| `toQuerySpec()` | ✅ | — | query-builder.test.ts |
| Field name validation | ✅ | — | query-builder.test.ts |

## ReadCache

| Feature | Unit | Test File |
|---------|------|-----------|
| `get()` / `set()` | ✅ | features.test.ts |
| `invalidate()` | ✅ | features.test.ts |
| `invalidateByPrefix()` | ✅ | features.test.ts |
| `buildKey()` | ✅ | features.test.ts |
| TTL expiration | ✅ | features.test.ts |
| TTL Infinity (default) | ✅ | features.test.ts |
| maxSize eviction | ✅ | features.test.ts |

## HookRegistry

| Method | Unit | Integration | Test File |
|--------|------|-------------|-----------|
| `on()` | ✅ | ✅ | features.test.ts, hooks-cache.test.ts |
| `run()` | ✅ | ✅ | features.test.ts, hooks-cache.test.ts |
| `has()` | ✅ | — | features.test.ts |
| `clone()` | ✅ | — | features.test.ts |

## TransactionBuilder

| Method | Unit | Test File |
|--------|------|-----------|
| `create()` | ✅ | transaction.test.ts |
| `upsert()` | ✅ | transaction.test.ts |
| `replace()` | ✅ | transaction.test.ts |
| `delete()` | ✅ | transaction.test.ts |
| `patch()` | ✅ | transaction.test.ts |
| `execute()` — success | ✅ | transaction.test.ts |
| `execute()` — partial failure | ✅ | transaction.test.ts |
| `execute()` — batch error | ✅ | transaction.test.ts |

## Model Definition

| Feature | Unit | Test File |
|---------|------|-----------|
| `defineModel()` | ✅ | define-model.test.ts |
| Partition key validation | ✅ | define-model.test.ts |
| Discriminator validation | ✅ | define-model.test.ts |
| Defaults (static + factory) | ✅ | define-model.test.ts, features.test.ts |
| DTO omit/pick | ✅ | dto.test.ts |
| `model.toDto()` | ✅ | dto.test.ts |
| `DtoPolicy` apply/strip | ✅ | dto.test.ts |
| `DtoPolicy` overrides | ✅ | dto.test.ts |
| `defineRepository()` | ✅ | features.test.ts |
| `_types` runtime guard | ✅ | define-model.test.ts |

## Error Handling

| Feature | Unit | Test File |
|---------|------|-----------|
| `mapCosmosError()` — 404 | ✅ | map-cosmos-error.test.ts |
| `mapCosmosError()` — 409 | ✅ | map-cosmos-error.test.ts |
| `mapCosmosError()` — 412 | ✅ | map-cosmos-error.test.ts |
| `mapCosmosError()` — 429 + retryAfter | ✅ | map-cosmos-error.test.ts |
| `mapCosmosError()` — pass-through | ✅ | map-cosmos-error.test.ts |
| `mapCosmosError()` — string code | ✅ | map-cosmos-error.test.ts |
| `ValidationError` | ✅ | cosmio-container.test.ts |

## MigrationRegistry

| Feature | Unit | Integration | Test File |
|---------|------|-------------|-----------|
| `register()` | ✅ | — | migration-registry.test.ts |
| `register()` duplicate | ✅ | — | migration-registry.test.ts |
| `apply()` version-based | ✅ | ✅ | migration-registry.test.ts, migration.test.ts |
| `apply()` scope filtering | ✅ | — | migration-registry.test.ts |
| `currentVersion` | ✅ | — | migration-registry.test.ts |

## Azure Functions Integration

| Feature | Unit | Integration | Test File |
|---------|------|-------------|-----------|
| `cosmioHooks()` (v4) | ✅ | — | azure-functions.test.ts |
| `cosmioV3()` | ✅ | — | azure-functions.test.ts |
| `withCosmioContext()` | ✅ | ✅ | azure-functions.test.ts, hooks-cache.test.ts |
| `getCosmioContext()` | ✅ | — | azure-functions.test.ts |
| `getInvocationCache()` | ✅ | — | azure-functions.test.ts |

## Schema Generation

| Feature | Unit | Test File |
|---------|------|-----------|
| `toJsonSchema()` | ✅ | json-schema.test.ts |
| `toJsonSchemas()` | ✅ | json-schema.test.ts |
| `toMermaidER()` | ✅ | mermaid.test.ts |
| `toMarkdown()` | ✅ | markdown.test.ts |
| `toMarkdownDoc()` | ✅ | markdown.test.ts |
| `toOpenAPI()` | ✅ | openapi.test.ts |

## Introspect

| Feature | Unit | Test File |
|---------|------|-----------|
| `inferSchema()` | ✅ | infer-schema.test.ts |
| `generateModelSource()` | ❌ | — |
| `toPascalCase()` | ❌ | — |
| `sampleContainer()` | ❌ | — |
| `pull()` | ❌ | — |

## Config

| Feature | Unit | Test File |
|---------|------|-----------|
| `defineConfig()` | ❌ | — |
| `loadConfig()` | ❌ | — |

## Utilities

| Feature | Unit | Test File |
|---------|------|-----------|
| `ensureContainer()` | ✅ (via integration) | integration tests |
| `ensureContainers()` conflict | ❌ | — |
| `extractPartitionKey()` | ✅ (indirect) | cosmio-container.test.ts |
| `buildPartitionKey()` | ✅ (indirect) | cosmio-container.test.ts |
| `extractDescriptions()` | ✅ (indirect) | define-model.test.ts |

## Advisor

| Feature | Unit | Test File |
|---------|------|-----------|
| `analyze()` | ✅ | analyzer.test.ts |
| `generateAdvisorPrompt()` | ✅ | ai-prompt.test.ts |

---

## Gaps Summary

| Category | Missing Tests |
|----------|--------------|
| Introspect | `generateModelSource()`, `toPascalCase()`, `sampleContainer()`, `pull()` |
| Config | `defineConfig()`, `loadConfig()` |
| Utils | `ensureContainers()` conflict detection |
