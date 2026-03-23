import type { Container, JSONValue, SqlParameter, SqlQuerySpec } from "@azure/cosmos";
import type { z } from "zod";
import { mapCosmosError } from "../errors/index.js";
import { getInvocationCache } from "../integrations/azure-functions.js";
import type { DtoMap, ModelDefinition, ResolveDtoRule } from "../model/model-types.js";
import type { DocumentRead } from "../types/inference.js";
import type {
  BooleanFilter,
  GenericFilter,
  NumberFilter,
  StringFilter,
  WhereInput,
} from "../types/where.js";
import type { ReadCache } from "./cache.js";

const SAFE_FIELD_NAME = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

function assertSafeFieldName(field: string): void {
  if (!SAFE_FIELD_NAME.test(field)) {
    throw new Error(`Invalid field name "${field}": must be alphanumeric/underscore/dot only`);
  }
}

type ComparisonOp =
  | "="
  | "!="
  | "<"
  | ">"
  | "<="
  | ">="
  | "CONTAINS"
  | "STARTSWITH"
  | "ENDSWITH"
  | "ARRAY_CONTAINS";

interface WhereClause {
  field: string;
  op: ComparisonOp;
  value: unknown;
}

interface InClause {
  field: string;
  values: unknown[];
}

interface OrderByClause {
  field: string;
  direction: "ASC" | "DESC";
}

/**
 * A query builder with selected fields — exec() returns Pick<T, K>[].
 */
export interface ProjectedQueryBuilder<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TPaths extends readonly [string, ...string[]],
  K extends string & keyof z.infer<TSchema>,
> {
  where(input: WhereInput<TSchema>): ProjectedQueryBuilder<TSchema, TPaths, K>;
  where(
    field: string & keyof z.infer<TSchema>,
    op: ComparisonOp,
    value: unknown,
  ): ProjectedQueryBuilder<TSchema, TPaths, K>;
  whereRaw(
    expression: string,
    params?: Record<string, unknown>,
  ): ProjectedQueryBuilder<TSchema, TPaths, K>;
  orderBy(
    field: string & keyof z.infer<TSchema>,
    direction?: "ASC" | "DESC",
  ): ProjectedQueryBuilder<TSchema, TPaths, K>;
  limit(n: number): ProjectedQueryBuilder<TSchema, TPaths, K>;
  offset(n: number): ProjectedQueryBuilder<TSchema, TPaths, K>;
  exec(): Promise<Pick<z.infer<TSchema>, K>[]>;
  count(): Promise<number>;
  toQuerySpec(): SqlQuerySpec;
}

/**
 * A query builder with DTO transformation — exec() returns DTO-typed results.
 */
export interface DtoQueryBuilder<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TPaths extends readonly [string, ...string[]],
  TDtoMap extends DtoMap<TSchema>,
  K extends string & keyof TDtoMap,
> {
  where(input: WhereInput<TSchema>): DtoQueryBuilder<TSchema, TPaths, TDtoMap, K>;
  where(
    field: string & keyof z.infer<TSchema>,
    op: ComparisonOp,
    value: unknown,
  ): DtoQueryBuilder<TSchema, TPaths, TDtoMap, K>;
  whereRaw(
    expression: string,
    params?: Record<string, unknown>,
  ): DtoQueryBuilder<TSchema, TPaths, TDtoMap, K>;
  orderBy(
    field: string & keyof z.infer<TSchema>,
    direction?: "ASC" | "DESC",
  ): DtoQueryBuilder<TSchema, TPaths, TDtoMap, K>;
  limit(n: number): DtoQueryBuilder<TSchema, TPaths, TDtoMap, K>;
  offset(n: number): DtoQueryBuilder<TSchema, TPaths, TDtoMap, K>;
  exec(): Promise<ResolveDtoRule<TSchema, TDtoMap[K]>[]>;
  count(): Promise<number>;
  toQuerySpec(): SqlQuerySpec;
}

/**
 * Fluent query builder for type-safe Cosmos DB queries.
 */
export class QueryBuilder<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TPaths extends readonly [string, ...string[]],
> {
  private readonly _container: Container;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accept models with any defaults/DtoMap
  private readonly _model: ModelDefinition<TSchema, TPaths, any, any>;
  private readonly _partitionKeyValues: readonly unknown[] | undefined;
  private readonly _postProcess:
    | ((
        docs: Record<string, unknown>[],
      ) => DocumentRead<TSchema>[] | Promise<DocumentRead<TSchema>[]>)
    | undefined;
  private readonly _includeSoftDeleted: boolean;
  private readonly _instanceCache: ReadCache | undefined;
  private readonly _whereClauses: WhereClause[] = [];
  private readonly _inClauses: InClause[] = [];
  private readonly _rawConditions: {
    expression: string;
    parameters: { name: string; value: unknown }[];
  }[] = [];
  private readonly _orderByClauses: OrderByClause[] = [];
  private readonly _selectFields: string[] = [];
  private _limitValue?: number;
  private _offsetValue?: number;
  private _dtoName?: string;

  constructor(
    container: Container,
    // biome-ignore lint/suspicious/noExplicitAny: accept models with any defaults/DtoMap
    model: ModelDefinition<TSchema, TPaths, any, any>,
    partitionKeyValues?: readonly unknown[],
    postProcess?: (
      docs: Record<string, unknown>[],
    ) => DocumentRead<TSchema>[] | Promise<DocumentRead<TSchema>[]>,
    includeSoftDeleted = false,
    instanceCache?: ReadCache,
  ) {
    this._container = container;
    this._model = model;
    this._partitionKeyValues = partitionKeyValues;
    this._postProcess = postProcess;
    this._includeSoftDeleted = includeSoftDeleted;
    this._instanceCache = instanceCache;
  }

  /**
   * Add WHERE conditions.
   *
   * Supports two styles:
   *
   * **Prisma-style (recommended):**
   * ```ts
   * .where({
   *   name: { contains: "Alice" },
   *   age: { gte: 18 },
   *   status: "active",   // shorthand for { equals: "active" }
   * })
   * ```
   *
   * **Classic style:**
   * ```ts
   * .where("name", "CONTAINS", "Alice")
   * .where("age", ">=", 18)
   * ```
   */
  where(input: WhereInput<TSchema>): this;
  where(field: string & keyof z.infer<TSchema>, op: ComparisonOp, value: unknown): this;
  where(
    fieldOrInput: (string & keyof z.infer<TSchema>) | WhereInput<TSchema>,
    op?: ComparisonOp,
    value?: unknown,
  ): this {
    if (typeof fieldOrInput === "string") {
      assertSafeFieldName(fieldOrInput);
      this._whereClauses.push({ field: fieldOrInput, op: op!, value });
      return this;
    }

    // Prisma-style object
    for (const [field, filter] of Object.entries(fieldOrInput)) {
      assertSafeFieldName(field);
      if (filter === undefined) continue;

      if (typeof filter !== "object" || filter === null) {
        // Shorthand: { status: "active" } → equals
        this._whereClauses.push({ field, op: "=", value: filter });
        continue;
      }

      const f = filter as StringFilter & NumberFilter & BooleanFilter & GenericFilter<unknown>;

      if (f.equals !== undefined) this._whereClauses.push({ field, op: "=", value: f.equals });
      if (f.not !== undefined) this._whereClauses.push({ field, op: "!=", value: f.not });
      if ("contains" in f && f.contains !== undefined)
        this._whereClauses.push({ field, op: "CONTAINS", value: f.contains });
      if ("startsWith" in f && f.startsWith !== undefined)
        this._whereClauses.push({ field, op: "STARTSWITH", value: f.startsWith });
      if ("endsWith" in f && f.endsWith !== undefined)
        this._whereClauses.push({ field, op: "ENDSWITH", value: f.endsWith });
      if ("gt" in f && f.gt !== undefined) this._whereClauses.push({ field, op: ">", value: f.gt });
      if ("gte" in f && f.gte !== undefined)
        this._whereClauses.push({ field, op: ">=", value: f.gte });
      if ("lt" in f && f.lt !== undefined) this._whereClauses.push({ field, op: "<", value: f.lt });
      if ("lte" in f && f.lte !== undefined)
        this._whereClauses.push({ field, op: "<=", value: f.lte });
      if ("in" in f && f.in !== undefined) this._inClauses.push({ field, values: f.in });
    }

    return this;
  }

  /**
   * Add a raw Cosmos DB SQL condition. Use this for expressions not covered
   * by the typed where() API (geo queries, UDFs, complex expressions, etc.).
   *
   * @security **NEVER** interpolate user input into the `expression` string.
   * The expression is embedded directly into the SQL query without validation.
   * Always use the `params` argument for user-supplied values to prevent
   * Cosmos DB SQL injection.
   *
   * @example
   * ```ts
   * // Geo distance query
   * .whereRaw("ST_DISTANCE(c.location, @center) < @radius", {
   *   "@center": { type: "Point", coordinates: [139.7, 35.6] },
   *   "@radius": 1000,
   * })
   *
   * // IS_DEFINED check
   * .whereRaw("IS_DEFINED(c.metadata)")
   *
   * // Array check
   * .whereRaw("ARRAY_LENGTH(c.tags) > @min", { "@min": 0 })
   * ```
   */
  whereRaw(expression: string, params?: Record<string, unknown>): this {
    const parameters = params
      ? Object.entries(params).map(([name, value]) => ({ name, value }))
      : [];
    this._rawConditions.push({ expression, parameters });
    return this;
  }

  /**
   * Add an ORDER BY clause.
   */
  orderBy(field: string & keyof z.infer<TSchema>, direction: "ASC" | "DESC" = "ASC"): this {
    assertSafeFieldName(field);
    this._orderByClauses.push({ field, direction });
    return this;
  }

  /**
   * Limit the number of results.
   */
  limit(n: number): this {
    if (!Number.isInteger(n) || n < 0)
      throw new Error(`limit must be a non-negative integer, got ${n}`);
    this._limitValue = n;
    return this;
  }

  /**
   * Skip the first n results.
   *
   * **Note:** Cosmos DB requires LIMIT with OFFSET. If `limit()` is not called,
   * a default limit of 1000 is applied automatically.
   */
  offset(n: number): this {
    if (!Number.isInteger(n) || n < 0)
      throw new Error(`offset must be a non-negative integer, got ${n}`);
    this._offsetValue = n;
    return this;
  }

  /**
   * Select specific fields (projection). Reduces RU by reading less data.
   * The returned type is narrowed to only the selected fields.
   *
   * @example
   * ```ts
   * const names = await users.find(["t1"]).select("id", "name").exec();
   * // → { id: string; name: string }[]
   * ```
   */
  select<K extends string & keyof z.infer<TSchema>>(
    ...fields: K[]
  ): ProjectedQueryBuilder<TSchema, TPaths, K> {
    for (const f of fields) assertSafeFieldName(f);
    this._selectFields.push(...fields);
    return this as unknown as ProjectedQueryBuilder<TSchema, TPaths, K>;
  }

  /**
   * Apply a named DTO transformation to query results.
   * The exec() return type is narrowed to the DTO shape, and results
   * are transformed via Zod parse at runtime (extra fields stripped).
   *
   * @example
   * ```ts
   * const apiUsers = await users.find(["t1"])
   *   .where({ status: "active" })
   *   .asDto("api")
   *   .exec();
   * // → passwordHash, internalScore stripped from each result
   * ```
   */
  asDto<TDtoMap extends DtoMap<TSchema>, K extends string & keyof TDtoMap>(
    name: K,
  ): DtoQueryBuilder<TSchema, TPaths, TDtoMap, K> {
    this._dtoName = name;
    return this as unknown as DtoQueryBuilder<TSchema, TPaths, TDtoMap, K>;
  }

  /**
   * Count documents matching the current filters without fetching them.
   * Uses `SELECT VALUE COUNT(1)` for minimal RU consumption.
   *
   * @example
   * ```ts
   * const total = await users.find(["t1"]).where({ role: "admin" }).count();
   * // → 42
   * ```
   */
  async count(): Promise<number> {
    try {
      const baseSpec = this.toQuerySpec();
      // Replace SELECT ... FROM c with SELECT VALUE COUNT(1) FROM c
      // Also strip ORDER BY / OFFSET / LIMIT which are invalid with COUNT
      let countQuery = baseSpec.query.replace(
        /SELECT\s+(TOP\s+\d+\s+)?.+?\s+FROM/i,
        "SELECT VALUE COUNT(1) FROM",
      );
      countQuery = countQuery.replace(/\s+ORDER BY\s+.+$/i, "");
      countQuery = countQuery.replace(/\s+OFFSET\s+\d+\s+LIMIT\s+\d+$/i, "");

      const options: Record<string, unknown> = {};
      if (this._partitionKeyValues) {
        options.partitionKey =
          this._partitionKeyValues.length === 1
            ? this._partitionKeyValues[0]
            : [...this._partitionKeyValues];
      }

      const { resources } = await this._container.items
        .query<number>({ query: countQuery, parameters: baseSpec.parameters ?? [] }, options)
        .fetchAll();

      return resources[0] ?? 0;
    } catch (error) {
      throw mapCosmosError(error);
    }
  }

  /**
   * Build the SQL query spec.
   */
  toQuerySpec(): SqlQuerySpec {
    const parameters: SqlParameter[] = [];
    const conditions: string[] = [];
    let paramIndex = 0;

    // Soft delete filter
    if (this._model.softDelete?.autoExclude && !this._includeSoftDeleted) {
      conditions.push(`NOT IS_DEFINED(c.${this._model.softDelete.field})`);
    }

    // Discriminator filter
    if (this._model.discriminator) {
      const paramName = `@p${paramIndex++}`;
      conditions.push(`c.${this._model.discriminator.field} = ${paramName}`);
      parameters.push({ name: paramName, value: this._model.discriminator.value as JSONValue });
    }

    // WHERE clauses
    for (const clause of this._whereClauses) {
      const paramName = `@p${paramIndex++}`;
      if (
        clause.op === "CONTAINS" ||
        clause.op === "STARTSWITH" ||
        clause.op === "ENDSWITH" ||
        clause.op === "ARRAY_CONTAINS"
      ) {
        conditions.push(`${clause.op}(c.${clause.field}, ${paramName})`);
      } else {
        conditions.push(`c.${clause.field} ${clause.op} ${paramName}`);
      }
      parameters.push({ name: paramName, value: clause.value as JSONValue });
    }

    // IN clauses
    for (const clause of this._inClauses) {
      const paramName = `@p${paramIndex++}`;
      conditions.push(`ARRAY_CONTAINS(${paramName}, c.${clause.field})`);
      parameters.push({ name: paramName, value: clause.values as JSONValue });
    }

    // Raw SQL conditions
    for (const raw of this._rawConditions) {
      conditions.push(raw.expression);
      for (const p of raw.parameters) {
        parameters.push({ name: p.name, value: p.value as JSONValue });
      }
    }

    let query = "SELECT";

    // Only use TOP when OFFSET is not set (OFFSET/LIMIT handles pagination)
    if (this._limitValue !== undefined && this._offsetValue === undefined) {
      query += ` TOP ${this._limitValue}`;
    }

    if (this._selectFields.length > 0) {
      query += ` ${this._selectFields.map((f) => `c.${f}`).join(", ")} FROM c`;
    } else {
      query += " * FROM c";
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    if (this._orderByClauses.length > 0) {
      const orderParts = this._orderByClauses.map((o) => `c.${o.field} ${o.direction}`);
      query += ` ORDER BY ${orderParts.join(", ")}`;
    }

    if (this._offsetValue !== undefined) {
      query += ` OFFSET ${this._offsetValue} LIMIT ${this._limitValue ?? 1000}`;
    }

    return { query, parameters };
  }

  /**
   * Execute the query and return results.
   * Results are cached per-invocation if AsyncLocalStorage context or instance cache is active.
   */
  async exec(): Promise<DocumentRead<TSchema>[]> {
    try {
      const querySpec = this.toQuerySpec();

      // Check query cache
      const cache = this._resolveCache();
      const cacheKey = cache ? this._buildQueryCacheKey(querySpec) : undefined;
      if (cache && cacheKey) {
        const cached = cache.get<DocumentRead<TSchema>[]>(cacheKey);
        if (cached !== undefined) return cached;
      }

      const options: Record<string, unknown> = {};

      if (this._partitionKeyValues) {
        if (this._partitionKeyValues.length === 1) {
          options.partitionKey = this._partitionKeyValues[0];
        } else {
          options.partitionKey = [...this._partitionKeyValues];
        }
      }

      const { resources } = await this._container.items
        .query<Record<string, unknown>>(querySpec, options)
        .fetchAll();

      let results: unknown[] = this._postProcess
        ? await this._postProcess(resources)
        : (resources as DocumentRead<TSchema>[]);

      // Apply DTO transformation if asDto() was called
      if (this._dtoName) {
        const dtoSchema = this._model.dtoSchemas[this._dtoName];
        if (!dtoSchema) {
          throw new Error(`DTO "${this._dtoName}" is not defined in model "${this._model.name}"`);
        }
        results = results.map((doc) => dtoSchema.parse(doc));
      }

      // Populate cache
      if (cache && cacheKey) {
        cache.set(cacheKey, results);
      }

      return results as DocumentRead<TSchema>[];
    } catch (error) {
      throw mapCosmosError(error);
    }
  }

  private _resolveCache(): ReadCache | undefined {
    return getInvocationCache() ?? this._instanceCache;
  }

  private _buildQueryCacheKey(spec: SqlQuerySpec): string {
    const pkPart = this._partitionKeyValues ? JSON.stringify(this._partitionKeyValues) : "cross";
    const paramPart = spec.parameters
      ? spec.parameters.map((p) => `${p.name}=${JSON.stringify(p.value)}`).join("&")
      : "";
    return `query::${this._model.container}::${spec.query}::${paramPart}::${pkPart}`;
  }
}
