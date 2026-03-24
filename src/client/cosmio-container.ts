import type { Container, PatchRequestBody, SqlQuerySpec } from "@azure/cosmos";
import type { z } from "zod";
import { CosmioError, mapCosmosError, ValidationError } from "../errors/index.js";
import { getInvocationCache } from "../integrations/azure-functions.js";
import type { MigrationRegistry } from "../migration/migration-registry.js";
import type {
  CreateInputWithDefaults,
  DefaultsMap,
  ModelDefinition,
} from "../model/model-types.js";
import type { DocumentRead } from "../types/inference.js";
import type { PartitionKeyValues } from "../types/partition-key.js";
import { buildPartitionKey, extractPartitionKey } from "../utils/partition-key.js";
import { ReadCache } from "./cache.js";
import type { HookEvent, HookFn } from "./hooks.js";
import { HookRegistry } from "./hooks.js";
import type { WithMetrics } from "./metrics.js";
import { extractRU } from "./metrics.js";
import { QueryBuilder } from "./query-builder.js";

export type BulkOperation<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TDefaults extends DefaultsMap<TSchema> = DefaultsMap<TSchema>,
> =
  | { type: "create"; body: CreateInputWithDefaults<TSchema, TDefaults> }
  | { type: "upsert"; body: CreateInputWithDefaults<TSchema, TDefaults> }
  | {
      type: "delete";
      id: string;
      partitionKeyValues: readonly unknown[];
    };

/**
 * Type-safe container operations for a single model.
 */
export class CosmioContainer<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TPaths extends readonly [string, ...string[]],
  TDefaults extends DefaultsMap<TSchema> = DefaultsMap<TSchema>,
> {
  readonly model: ModelDefinition<TSchema, TPaths, TDefaults>;
  private readonly _container: Container;
  private readonly _migrations: MigrationRegistry | undefined;
  private _hooks = new HookRegistry();
  private _cache?: ReadCache;

  constructor(
    container: Container,
    model: ModelDefinition<TSchema, TPaths, TDefaults>,
    migrations?: MigrationRegistry,
  ) {
    this._container = container;
    this.model = model;
    this._migrations = migrations;
  }

  /**
   * Create an invocation-scoped wrapper with an in-memory read cache.
   * Cache lives only as long as the returned object — ideal for per-request scope.
   *
   * @example
   * ```ts
   * // In an Azure Function or request handler:
   * async function handler() {
   *   const users = client.model(UserModel).scope();
   *   await users.findById("u1", ["t1"]);  // reads from Cosmos DB
   *   await users.findById("u1", ["t1"]);  // cached (0 RU)
   *   // scope is GC'd when handler returns → cache gone
   * }
   * ```
   */
  scope(): CosmioContainer<TSchema, TPaths, TDefaults> {
    const scoped = new CosmioContainer(this._container, this.model, this._migrations);
    scoped._cache = new ReadCache();
    scoped._hooks = this._hooks.clone();
    return scoped;
  }

  /**
   * Register a lifecycle hook.
   *
   * @example
   * ```ts
   * container.use("beforeCreate", (doc) => { doc.createdBy = currentUser(); });
   * container.use("afterRead", (doc) => { doc.name = decrypt(doc.name); });
   * ```
   */
  use(event: HookEvent, fn: HookFn): this {
    this._hooks.on(event, fn);
    return this;
  }

  /**
   * Access the underlying Cosmos DB Container for escape-hatch operations.
   */
  get raw(): Container {
    return this._container;
  }

  /**
   * Create a document with Zod validation.
   * Fields with defaults defined in the model are optional — missing fields
   * are filled automatically before validation.
   */
  async create(doc: CreateInputWithDefaults<TSchema, TDefaults>): Promise<DocumentRead<TSchema>> {
    const merged = this._applyDefaults(doc);
    const parsed = this._validate(merged);
    this._validateDiscriminator(parsed);
    await this._hooks.run("beforeCreate", parsed as Record<string, unknown>);
    try {
      const { resource } = await this._container.items.create(parsed);
      if (!resource) throw new CosmioError("Create returned no resource", "COSMOS_ERROR");
      const result = resource as Record<string, unknown>;
      // Invalidate query cache (new doc may affect query results)
      const cache = this._getCache();
      if (cache) cache.invalidateByPrefix(`query::${this.model.container}::`);
      await this._hooks.run("afterCreate", result);
      return result as DocumentRead<TSchema>;
    } catch (error) {
      throw mapCosmosError(error);
    }
  }

  /**
   * Upsert a document with Zod validation.
   * Fields with defaults defined in the model are optional — missing fields
   * are filled automatically before validation.
   */
  async upsert(doc: CreateInputWithDefaults<TSchema, TDefaults>): Promise<DocumentRead<TSchema>> {
    const merged = this._applyDefaults(doc);
    const parsed = this._validate(merged);
    this._validateDiscriminator(parsed);
    await this._hooks.run("beforeUpsert", parsed as Record<string, unknown>);
    try {
      const { resource } = await this._container.items.upsert(parsed);
      if (!resource) throw new CosmioError("Upsert returned no resource", "COSMOS_ERROR");
      const result = resource as Record<string, unknown>;
      if (result.id) {
        const pkVals = extractPartitionKey(this.model, result) as unknown as readonly unknown[];
        this._invalidateCache(result.id as string, pkVals);
      }
      await this._hooks.run("afterUpsert", result);
      return result as DocumentRead<TSchema>;
    } catch (error) {
      throw mapCosmosError(error);
    }
  }

  /**
   * Point read by id + partition key values.
   */
  async findById(
    id: string,
    partitionKeyValues: PartitionKeyValues<TSchema, TPaths>,
  ): Promise<DocumentRead<TSchema> | undefined> {
    const pkArray = partitionKeyValues as unknown as readonly unknown[];
    const cache = this._getCache();
    // Check cache first (instance cache or AsyncLocalStorage invocation cache)
    if (cache) {
      const cacheKey = ReadCache.buildKey(this.model.container, id, pkArray);
      const cached = cache.get<DocumentRead<TSchema>>(cacheKey);
      if (cached !== undefined) return cached;
    }
    try {
      const pk = buildPartitionKey(pkArray);
      const { resource } = await this._container
        .item(id, pk as string | number | boolean)
        .read<Record<string, unknown>>();
      if (!resource) return undefined;
      // Soft delete: auto-exclude (check both undefined and null for consistency with query path)
      if (this.model.softDelete?.autoExclude && resource[this.model.softDelete.field] != null) {
        return undefined;
      }
      const result = await this._processReadAsync(resource);
      // Populate cache
      if (cache) {
        const cacheKey = ReadCache.buildKey(this.model.container, id, pkArray);
        cache.set(cacheKey, result);
      }
      return result;
    } catch (error) {
      const mapped = mapCosmosError(error);
      if (mapped.code === "NOT_FOUND") {
        return undefined;
      }
      throw mapped;
    }
  }

  /**
   * Replace an entire document.
   */
  async replace(
    id: string,
    doc: CreateInputWithDefaults<TSchema, TDefaults>,
    options?: { etag?: string },
  ): Promise<DocumentRead<TSchema>> {
    const merged = this._applyDefaults(doc);
    const parsed = this._validate(merged);
    this._validateDiscriminator(parsed);
    // Verify id matches
    const parsedRecord = parsed as Record<string, unknown>;
    if (parsedRecord.id !== undefined && parsedRecord.id !== id) {
      throw new ValidationError(
        `Document id "${String(parsedRecord.id)}" does not match replace target "${id}"`,
        [{ path: ["id"], message: "id mismatch" }],
      );
    }
    await this._hooks.run("beforeReplace", parsedRecord);
    try {
      const requestOptions: Record<string, unknown> = {};
      if (options?.etag) {
        requestOptions.accessCondition = {
          type: "IfMatch",
          condition: options.etag,
        };
      }
      const pk = buildPartitionKey(
        extractPartitionKey(
          this.model,
          parsed as Record<string, unknown>,
        ) as unknown as readonly unknown[],
      );
      const { resource } = await this._container
        .item(id, pk as string | number | boolean)
        .replace(parsed, requestOptions);
      if (!resource) throw new CosmioError("Replace returned no resource", "COSMOS_ERROR");
      const result = resource as Record<string, unknown>;
      const pkVals = extractPartitionKey(
        this.model,
        parsed as Record<string, unknown>,
      ) as unknown as readonly unknown[];
      this._invalidateCache(id, pkVals);
      await this._hooks.run("afterReplace", result);
      return result as DocumentRead<TSchema>;
    } catch (error) {
      throw mapCosmosError(error);
    }
  }

  /**
   * Delete a document. If soft delete is configured, sets the deletion timestamp
   * instead of physically removing. Use `hardDelete()` to force physical deletion.
   */
  async delete(id: string, partitionKeyValues: PartitionKeyValues<TSchema, TPaths>): Promise<void> {
    const pkArray = partitionKeyValues as unknown as readonly unknown[];
    this._invalidateCache(id, pkArray);
    await this._hooks.run("beforeDelete", { id, partitionKeyValues } as unknown as Record<
      string,
      unknown
    >);
    if (this.model.softDelete) {
      try {
        const pk = buildPartitionKey(partitionKeyValues as unknown as readonly unknown[]);
        await this._container.item(id, pk as string | number | boolean).patch({
          operations: [{ op: "set", path: `/${this.model.softDelete.field}`, value: Date.now() }],
        });
      } catch (error) {
        throw mapCosmosError(error);
      }
      await this._hooks.run("afterDelete", { id } as Record<string, unknown>);
      return;
    }
    try {
      const pk = buildPartitionKey(partitionKeyValues as unknown as readonly unknown[]);
      await this._container.item(id, pk as string | number | boolean).delete();
    } catch (error) {
      throw mapCosmosError(error);
    }
    await this._hooks.run("afterDelete", { id } as Record<string, unknown>);
  }

  /**
   * Physically delete a document (bypasses soft delete).
   */
  async hardDelete(
    id: string,
    partitionKeyValues: PartitionKeyValues<TSchema, TPaths>,
  ): Promise<void> {
    this._invalidateCache(id, partitionKeyValues as unknown as readonly unknown[]);
    await this._hooks.run("beforeDelete", { id, partitionKeyValues } as unknown as Record<
      string,
      unknown
    >);
    try {
      const pk = buildPartitionKey(partitionKeyValues as unknown as readonly unknown[]);
      await this._container.item(id, pk as string | number | boolean).delete();
    } catch (error) {
      throw mapCosmosError(error);
    }
    await this._hooks.run("afterDelete", { id } as Record<string, unknown>);
  }

  /**
   * Restore a soft-deleted document by removing the deletion timestamp.
   * No-op if soft delete is not configured.
   */
  async restore(
    id: string,
    partitionKeyValues: PartitionKeyValues<TSchema, TPaths>,
  ): Promise<DocumentRead<TSchema> | undefined> {
    if (!this.model.softDelete) return undefined;
    this._invalidateCache(id, partitionKeyValues as unknown as readonly unknown[]);
    try {
      const pk = buildPartitionKey(partitionKeyValues as unknown as readonly unknown[]);
      const { resource } = await this._container
        .item(id, pk as string | number | boolean)
        .patch({ operations: [{ op: "remove", path: `/${this.model.softDelete.field}` }] });
      if (!resource) return undefined;
      return this._processReadAsync(resource as Record<string, unknown>);
    } catch (error) {
      throw mapCosmosError(error);
    }
  }

  /**
   * Query including soft-deleted documents (bypasses autoExclude).
   *
   * **Warning:** This returns deleted documents. Only use in admin or
   * internal contexts — never expose directly to end-user APIs without
   * proper authorization checks.
   */
  findWithDeleted(
    partitionKeyValues?: PartitionKeyValues<TSchema, TPaths>,
  ): QueryBuilder<TSchema, TPaths> {
    return new QueryBuilder(
      this._container,
      this.model,
      partitionKeyValues as unknown as readonly unknown[] | undefined,
      (docs) => this._processReadManyAsync(docs),
      true, // includeSoftDeleted
      this._cache,
    );
  }

  /**
   * Partial update using Cosmos DB patch operations.
   *
   * **Note:** Unlike `create`/`upsert`/`replace`, patch operations are NOT
   * validated against the Zod schema and have no `beforePatch`/`afterPatch`
   * hooks. This is a low-level escape hatch — use with care.
   */
  async patch(
    id: string,
    partitionKeyValues: PartitionKeyValues<TSchema, TPaths>,
    operations: PatchRequestBody,
  ): Promise<DocumentRead<TSchema>> {
    this._invalidateCache(id, partitionKeyValues as unknown as readonly unknown[]);
    try {
      const pk = buildPartitionKey(partitionKeyValues as unknown as readonly unknown[]);
      // Wrap array form into object form for compatibility with vnext emulator
      const patchBody = Array.isArray(operations) ? { operations } : operations;
      const { resource } = await this._container
        .item(id, pk as string | number | boolean)
        .patch(patchBody);
      if (!resource) throw new CosmioError("Patch returned no resource", "COSMOS_ERROR");
      return this._processReadAsync(resource as Record<string, unknown>);
    } catch (error) {
      throw mapCosmosError(error);
    }
  }

  /**
   * Execute a raw SQL query.
   *
   * @security When passing a string, **NEVER** interpolate user input directly.
   * Use `SqlQuerySpec` with parameterized values instead.
   */
  async query(
    querySpec: string | SqlQuerySpec,
    partitionKeyValues?: PartitionKeyValues<TSchema, TPaths>,
  ): Promise<DocumentRead<TSchema>[]> {
    try {
      const options: Record<string, unknown> = {};
      if (partitionKeyValues) {
        options.partitionKey = buildPartitionKey(
          partitionKeyValues as unknown as readonly unknown[],
        );
      }
      const spec: SqlQuerySpec = typeof querySpec === "string" ? { query: querySpec } : querySpec;
      const { resources } = await this._container.items
        .query<Record<string, unknown>>(spec, options)
        .fetchAll();
      return await this._processReadManyAsync(resources);
    } catch (error) {
      throw mapCosmosError(error);
    }
  }

  /**
   * Start a fluent query builder, optionally scoped to a partition key.
   */
  find(partitionKeyValues?: PartitionKeyValues<TSchema, TPaths>): QueryBuilder<TSchema, TPaths> {
    return new QueryBuilder(
      this._container,
      this.model,
      partitionKeyValues as unknown as readonly unknown[] | undefined,
      (docs) => this._processReadManyAsync(docs),
      false, // respect soft delete
      this._cache,
    );
  }

  /**
   * Execute bulk operations.
   *
   * **Note:** Lifecycle hooks (`beforeCreate`, `afterCreate`, etc.) are NOT
   * fired for bulk operations. If you rely on hooks for validation, audit,
   * or cache invalidation, use individual `create`/`upsert`/`delete` calls instead.
   */
  async bulk(operations: BulkOperation<TSchema, TDefaults>[]): Promise<void> {
    try {
      const cosmosOps = operations.map((op) => {
        switch (op.type) {
          case "create": {
            const merged = this._applyDefaults(op.body);
            const parsed = this._validate(merged);
            this._validateDiscriminator(parsed);
            const pkValues = extractPartitionKey(
              this.model,
              parsed as Record<string, unknown>,
            ) as unknown as readonly unknown[];
            return {
              operationType: "Create" as const,
              resourceBody: parsed as Record<string, unknown>,
              partitionKey: buildPartitionKey(pkValues),
            };
          }
          case "upsert": {
            const merged = this._applyDefaults(op.body);
            const parsed = this._validate(merged);
            this._validateDiscriminator(parsed);
            const pkValues = extractPartitionKey(
              this.model,
              parsed as Record<string, unknown>,
            ) as unknown as readonly unknown[];
            return {
              operationType: "Upsert" as const,
              resourceBody: parsed as Record<string, unknown>,
              partitionKey: buildPartitionKey(pkValues),
            };
          }
          case "delete":
            if (this.model.softDelete) {
              // Soft delete: patch instead of physical delete
              return {
                operationType: "Patch" as const,
                id: op.id,
                partitionKey: buildPartitionKey(op.partitionKeyValues),
                resourceBody: [
                  { op: "set", path: `/${this.model.softDelete.field}`, value: Date.now() },
                ] as unknown as Record<string, unknown>,
              };
            }
            return {
              operationType: "Delete" as const,
              id: op.id,
              partitionKey: buildPartitionKey(op.partitionKeyValues),
            };
          default:
            throw new Error(`Unknown bulk operation type`);
        }
      });
      const response = await this._container.items.bulk(
        cosmosOps as Parameters<Container["items"]["bulk"]>[0],
      );
      // Check for partial failures
      if (response && Array.isArray(response)) {
        const failures = response
          .map((r: { statusCode?: number }, index: number) => ({ ...r, index }))
          .filter((r) => r.statusCode && r.statusCode >= 400);
        if (failures.length > 0) {
          const first = failures[0] as { statusCode: number };
          const details = failures
            .map((f) => `[index=${f.index}, status=${f.statusCode}]`)
            .join(", ");
          throw mapCosmosError({
            code: first.statusCode,
            message: `Bulk operation had ${failures.length} failure(s): ${details}`,
          });
        }
      }
      // Invalidate query caches after successful bulk (data may have changed)
      const cache = this._getCache();
      if (cache) cache.invalidateByPrefix(`query::${this.model.container}::`);
    } catch (error) {
      throw mapCosmosError(error);
    }
  }

  // =========================================================================
  // Metrics variants — return { result, ru } with RU consumption
  // =========================================================================

  /**
   * Create with RU telemetry.
   */
  async createWithMetrics(
    doc: CreateInputWithDefaults<TSchema, TDefaults>,
  ): Promise<WithMetrics<DocumentRead<TSchema>>> {
    const merged = this._applyDefaults(doc);
    const parsed = this._validate(merged);
    this._validateDiscriminator(parsed);
    await this._hooks.run("beforeCreate", parsed as Record<string, unknown>);
    try {
      const response = await this._container.items.create(parsed);
      if (!response.resource) throw new CosmioError("Create returned no resource", "COSMOS_ERROR");
      const result = response.resource as Record<string, unknown>;
      const cache = this._getCache();
      if (cache) cache.invalidateByPrefix(`query::${this.model.container}::`);
      await this._hooks.run("afterCreate", result);
      return { result: result as DocumentRead<TSchema>, ru: extractRU(response.headers) };
    } catch (error) {
      throw mapCosmosError(error);
    }
  }

  /**
   * Point read with RU telemetry.
   */
  async findByIdWithMetrics(
    id: string,
    partitionKeyValues: PartitionKeyValues<TSchema, TPaths>,
  ): Promise<WithMetrics<DocumentRead<TSchema> | undefined>> {
    const pkArray = partitionKeyValues as unknown as readonly unknown[];
    // Check cache first (return ru: 0 on cache hit)
    const cache = this._getCache();
    if (cache) {
      const cacheKey = ReadCache.buildKey(this.model.container, id, pkArray);
      const cached = cache.get<DocumentRead<TSchema>>(cacheKey);
      if (cached !== undefined) return { result: cached, ru: 0 };
    }
    try {
      const pk = buildPartitionKey(pkArray);
      const response = await this._container
        .item(id, pk as string | number | boolean)
        .read<Record<string, unknown>>();
      if (!response.resource) return { result: undefined, ru: extractRU(response.headers) };
      // Soft delete: auto-exclude (check both undefined and null for consistency with findById)
      if (
        this.model.softDelete?.autoExclude &&
        response.resource[this.model.softDelete.field] != null
      ) {
        return { result: undefined, ru: extractRU(response.headers) };
      }
      const result = await this._processReadAsync(response.resource);
      if (cache) {
        const cacheKey = ReadCache.buildKey(this.model.container, id, pkArray);
        cache.set(cacheKey, result);
      }
      return { result, ru: extractRU(response.headers) };
    } catch (error) {
      const mapped = mapCosmosError(error);
      if (mapped.code === "NOT_FOUND") return { result: undefined, ru: 0 };
      throw mapped;
    }
  }

  /**
   * Upsert with RU telemetry.
   */
  async upsertWithMetrics(
    doc: CreateInputWithDefaults<TSchema, TDefaults>,
  ): Promise<WithMetrics<DocumentRead<TSchema>>> {
    const merged = this._applyDefaults(doc);
    const parsed = this._validate(merged);
    this._validateDiscriminator(parsed);
    await this._hooks.run("beforeUpsert", parsed as Record<string, unknown>);
    try {
      const response = await this._container.items.upsert(parsed);
      if (!response.resource) throw new CosmioError("Upsert returned no resource", "COSMOS_ERROR");
      const result = response.resource as Record<string, unknown>;
      if (result.id) {
        const pkVals = extractPartitionKey(this.model, result) as unknown as readonly unknown[];
        this._invalidateCache(result.id as string, pkVals);
      }
      await this._hooks.run("afterUpsert", result);
      return { result: result as DocumentRead<TSchema>, ru: extractRU(response.headers) };
    } catch (error) {
      throw mapCosmosError(error);
    }
  }

  /**
   * Delete with RU telemetry.
   */
  async deleteWithMetrics(
    id: string,
    partitionKeyValues: PartitionKeyValues<TSchema, TPaths>,
  ): Promise<WithMetrics<void>> {
    const pkArray = partitionKeyValues as unknown as readonly unknown[];
    this._invalidateCache(id, pkArray);
    await this._hooks.run("beforeDelete", { id, partitionKeyValues } as unknown as Record<
      string,
      unknown
    >);
    try {
      const pk = buildPartitionKey(pkArray);
      if (this.model.softDelete) {
        const response = await this._container.item(id, pk as string | number | boolean).patch({
          operations: [{ op: "set", path: `/${this.model.softDelete.field}`, value: Date.now() }],
        });
        await this._hooks.run("afterDelete", { id } as Record<string, unknown>);
        return { result: undefined, ru: extractRU(response.headers) };
      }
      const response = await this._container.item(id, pk as string | number | boolean).delete();
      await this._hooks.run("afterDelete", { id } as Record<string, unknown>);
      return { result: undefined, ru: extractRU(response.headers) };
    } catch (error) {
      throw mapCosmosError(error);
    }
  }

  /**
   * Resolve the active cache: AsyncLocalStorage (invocation-scoped) → instance cache → undefined.
   */
  private _getCache(): ReadCache | undefined {
    return getInvocationCache() ?? this._cache;
  }

  private _invalidateCache(id: string, pkValues: readonly unknown[]): void {
    const cache = this._getCache();
    if (cache) {
      // Invalidate point-read cache
      cache.invalidate(ReadCache.buildKey(this.model.container, id, pkValues));
      // Invalidate all query caches for this container (queries may return this doc)
      cache.invalidateByPrefix(`query::${this.model.container}::`);
    }
  }

  private _processRead(doc: Record<string, unknown>): DocumentRead<TSchema> {
    let result = doc;
    // 1. Global migrations
    if (this._migrations) {
      result = this._migrations.apply(result, {
        container: this.model.container,
        model: this.model.name,
      });
    }
    // 2. Model-level migrate
    if (this.model.migrate) {
      result = this.model.migrate(result);
    }
    // 3. Optional read validation
    if (this.model.validateOnRead) {
      result = this._validate(result) as Record<string, unknown>;
    }
    // 4. afterRead hooks (sync only for _processRead; async hooks use _processReadAsync)
    // Note: afterRead hooks are fired asynchronously in the public methods
    return result as DocumentRead<TSchema>;
  }

  private async _processReadAsync(doc: Record<string, unknown>): Promise<DocumentRead<TSchema>> {
    const result = this._processRead(doc);
    if (this._hooks.has("afterRead")) {
      await this._hooks.run("afterRead", result as unknown as Record<string, unknown>);
    }
    return result;
  }

  /**
   * Process multiple documents in parallel via Promise.all.
   * Note: afterRead hooks run concurrently across documents (order is NOT guaranteed).
   * Within a single document, hooks still execute in registration order.
   */
  private async _processReadManyAsync(
    docs: Record<string, unknown>[],
  ): Promise<DocumentRead<TSchema>[]> {
    if (
      !this._migrations &&
      !this.model.migrate &&
      !this.model.validateOnRead &&
      !this._hooks.has("afterRead")
    ) {
      return docs as DocumentRead<TSchema>[];
    }
    return Promise.all(docs.map((d) => this._processReadAsync(d)));
  }

  private _applyDefaults(doc: unknown): unknown {
    const defaults = this.model.defaults;
    if (!defaults || Object.keys(defaults).length === 0) {
      return doc;
    }
    const merged = { ...(doc as Record<string, unknown>) };
    for (const [key, defaultValue] of Object.entries(defaults)) {
      if (merged[key] === undefined) {
        merged[key] =
          typeof defaultValue === "function" ? (defaultValue as () => unknown)() : defaultValue;
      }
    }
    return merged;
  }

  private _validate(doc: unknown): z.output<TSchema> {
    const result = this.model.schema.safeParse(doc);
    if (!result.success) {
      throw new ValidationError(
        `Validation failed for model "${this.model.name}": ${result.error.message}`,
        result.error.issues,
      );
    }
    return result.data;
  }

  private _validateDiscriminator(doc: Record<string, unknown>): void {
    if (!this.model.discriminator) return;
    const { field, value } = this.model.discriminator;
    if (doc[field] !== value) {
      throw new ValidationError(
        `Discriminator field "${field}" must be "${value}" for model "${this.model.name}", got "${String(doc[field])}"`,
        [{ path: [field], message: `Expected "${value}"` }],
      );
    }
  }
}
