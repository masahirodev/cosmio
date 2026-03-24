import { describe, expect, it } from "vitest";
import { z } from "zod";
import { QueryBuilder } from "../../src/client/query-builder.js";
import { defineModel } from "../../src/model/define-model.js";

const TestModel = defineModel({
  name: "Test",
  container: "tests",
  partitionKey: ["/tenantId"],
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    name: z.string(),
    score: z.number(),
    createdAt: z.string(),
  }),
});

const DiscriminatedModel = defineModel({
  name: "TypedDoc",
  container: "docs",
  partitionKey: ["/tenantId"],
  discriminator: { field: "type", value: "typed" },
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    type: z.literal("typed"),
    name: z.string(),
  }),
});

describe("QueryBuilder", () => {
  // We test toQuerySpec() without actually running against Cosmos DB
  it("generates basic SELECT query", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c");
    expect(spec.parameters).toEqual([]);
  });

  it("generates WHERE clause", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where("name", "=", "test").toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE c.name = @p0");
    expect(spec.parameters).toEqual([{ name: "@p0", value: "test" }]);
  });

  it("generates multiple WHERE conditions with AND", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where("name", "=", "test").where("score", ">", 80).toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE c.name = @p0 AND c.score > @p1");
    expect(spec.parameters).toHaveLength(2);
  });

  it("generates CONTAINS function call", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where("name", "CONTAINS", "test").toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE CONTAINS(c.name, @p0)");
  });

  it("generates ORDER BY clause", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.orderBy("createdAt", "DESC").toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c ORDER BY c.createdAt DESC");
  });

  it("generates TOP with limit", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.limit(10).toQuerySpec();
    expect(spec.query).toBe("SELECT TOP 10 * FROM c");
  });

  it("generates OFFSET/LIMIT", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.offset(20).limit(10).toQuerySpec();
    expect(spec.query).toContain("OFFSET 20 LIMIT 10");
  });

  it("includes discriminator filter automatically", () => {
    const qb = new QueryBuilder(null as never, DiscriminatedModel);
    const spec = qb.toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE c.type = @p0");
    expect(spec.parameters).toEqual([{ name: "@p0", value: "typed" }]);
  });

  it("combines discriminator with user WHERE clause", () => {
    const qb = new QueryBuilder(null as never, DiscriminatedModel);
    const spec = qb.where("name", "=", "hello").toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE c.type = @p0 AND c.name = @p1");
  });

  it("combines all clauses together", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb
      .where("name", "CONTAINS", "test")
      .where("score", ">=", 50)
      .orderBy("createdAt", "DESC")
      .limit(5)
      .toQuerySpec();

    expect(spec.query).toBe(
      "SELECT TOP 5 * FROM c WHERE CONTAINS(c.name, @p0) AND c.score >= @p1 ORDER BY c.createdAt DESC",
    );
    expect(spec.parameters).toHaveLength(2);
  });

  // --- Prisma-style where ---

  it("where({ field: value }) — shorthand for equals", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where({ name: "Alice" }).toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE c.name = @p0");
    expect(spec.parameters).toEqual([{ name: "@p0", value: "Alice" }]);
  });

  it("where({ field: { equals } })", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where({ name: { equals: "Alice" } }).toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE c.name = @p0");
  });

  it("where({ field: { not } })", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where({ name: { not: "Bob" } }).toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE c.name != @p0");
  });

  it("where({ field: { contains } })", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where({ name: { contains: "lic" } }).toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE CONTAINS(c.name, @p0)");
  });

  it("where({ field: { startsWith } })", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where({ name: { startsWith: "Al" } }).toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE STARTSWITH(c.name, @p0)");
  });

  it("where({ field: { endsWith } })", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where({ name: { endsWith: "ce" } }).toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE ENDSWITH(c.name, @p0)");
  });

  it("where({ number: { gt, lte } }) — multiple operators on one field", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where({ score: { gt: 10, lte: 100 } }).toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE c.score > @p0 AND c.score <= @p1");
  });

  it("where({ field: { gte } })", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where({ score: { gte: 50 } }).toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE c.score >= @p0");
  });

  it("where({ field: { lt } })", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where({ score: { lt: 50 } }).toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE c.score < @p0");
  });

  it("where({ field: { in: [...] } }) — IN filter", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where({ name: { in: ["Alice", "Bob"] } }).toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE ARRAY_CONTAINS(@p0, c.name)");
    expect(spec.parameters).toEqual([{ name: "@p0", value: ["Alice", "Bob"] }]);
  });

  it("combines multiple fields in one where({})", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb
      .where({
        name: { contains: "test" },
        score: { gte: 50 },
        tenantId: "t1",
      })
      .toQuerySpec();

    expect(spec.query).toContain("CONTAINS(c.name, @p0)");
    expect(spec.query).toContain("c.score >= @p1");
    expect(spec.query).toContain("c.tenantId = @p2");
    expect(spec.parameters).toHaveLength(3);
  });

  // --- whereRaw (Azure native SQL) ---

  it("whereRaw with no params", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.whereRaw("IS_DEFINED(c.metadata)").toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE IS_DEFINED(c.metadata)");
    expect(spec.parameters).toEqual([]);
  });

  it("whereRaw with params", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb
      .whereRaw("ST_DISTANCE(c.location, @center) < @radius", {
        "@center": { type: "Point", coordinates: [139.7, 35.6] },
        "@radius": 1000,
      })
      .toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE ST_DISTANCE(c.location, @center) < @radius");
    expect(spec.parameters).toHaveLength(2);
    expect(spec.parameters).toContainEqual({
      name: "@center",
      value: { type: "Point", coordinates: [139.7, 35.6] },
    });
    expect(spec.parameters).toContainEqual({ name: "@radius", value: 1000 });
  });

  it("whereRaw combined with Prisma-style where", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb
      .where({ tenantId: "t1" })
      .whereRaw("ARRAY_LENGTH(c.tags) > @min", { "@min": 0 })
      .toQuerySpec();
    expect(spec.query).toBe(
      "SELECT * FROM c WHERE c.tenantId = @p0 AND ARRAY_LENGTH(c.tags) > @min",
    );
  });

  it("offset() without limit() applies default LIMIT 1000", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.offset(10).toQuerySpec();
    expect(spec.query).toContain("OFFSET 10 LIMIT 1000");
  });

  it("limit(0) generates TOP 0", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.limit(0).toQuerySpec();
    expect(spec.query).toBe("SELECT TOP 0 * FROM c");
  });

  it("mixes Prisma-style and classic where calls", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb
      .where({ name: { contains: "test" } })
      .where("score", ">=", 50)
      .toQuerySpec();

    expect(spec.query).toContain("CONTAINS(c.name, @p0)");
    expect(spec.query).toContain("c.score >= @p1");
  });

  // --- Field name validation (SQL injection prevention) ---

  it("rejects field names containing spaces", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    expect(() => qb.where("name OR 1=1" as never, "=", "x")).toThrow(/Invalid field name/);
  });

  it("rejects field names containing quotes", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    expect(() => qb.where('name"' as never, "=", "x")).toThrow(/Invalid field name/);
    expect(() => qb.where("name'" as never, "=", "x")).toThrow(/Invalid field name/);
  });

  it("allows dot-notation field names (e.g. address.city)", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where("address.city" as never, "=", "Tokyo").toQuerySpec();
    expect(spec.query).toContain("c.address.city = @p0");
  });

  it("rejects field names starting with a digit", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    expect(() => qb.where("0name" as never, "=", "x")).toThrow(/Invalid field name/);
  });

  // --- Classic WHERE: missing operators ---

  it("generates != operator", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where("name", "!=", "Bob").toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE c.name != @p0");
    expect(spec.parameters).toEqual([{ name: "@p0", value: "Bob" }]);
  });

  it("generates < operator", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where("score", "<", 50).toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE c.score < @p0");
  });

  it("generates <= operator", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where("score", "<=", 100).toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE c.score <= @p0");
  });

  it("generates STARTSWITH function call (classic)", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where("name", "STARTSWITH", "Al").toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE STARTSWITH(c.name, @p0)");
  });

  it("generates ENDSWITH function call (classic)", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where("name", "ENDSWITH", "ce").toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE ENDSWITH(c.name, @p0)");
  });

  it("generates ARRAY_CONTAINS function call (classic)", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.where("name", "ARRAY_CONTAINS", "tag1").toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE ARRAY_CONTAINS(c.name, @p0)");
  });

  // --- ORDER BY gaps ---

  it("generates ORDER BY ASC (default)", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.orderBy("name").toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c ORDER BY c.name ASC");
  });

  it("generates multiple ORDER BY fields", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.orderBy("name", "ASC").orderBy("createdAt", "DESC").toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c ORDER BY c.name ASC, c.createdAt DESC");
  });

  // --- Soft delete auto-filter ---

  it("generates NOT IS_DEFINED for soft delete auto-exclude", () => {
    const SoftModel = defineModel({
      name: "SoftDoc",
      container: "soft",
      partitionKey: ["/tenantId"],
      schema: z.object({
        id: z.string(),
        tenantId: z.string(),
        deletedAt: z.number().optional(),
      }),
      softDelete: { field: "deletedAt" },
    });
    const qb = new QueryBuilder(null as never, SoftModel);
    const spec = qb.toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE NOT IS_DEFINED(c.deletedAt)");
  });

  // --- COUNT gaps ---

  it("count strips ORDER BY from query", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const countSpec = qb.orderBy("name").toQuerySpec();
    // Verify base has ORDER BY
    expect(countSpec.query).toContain("ORDER BY");
    // count() replaces SELECT and strips ORDER BY
    const countQuery = countSpec.query
      .replace(/SELECT\s+(TOP\s+\d+\s+)?.+?\s+FROM/i, "SELECT VALUE COUNT(1) FROM")
      .replace(/\s+ORDER BY\s+.+$/i, "");
    expect(countQuery).toBe("SELECT VALUE COUNT(1) FROM c");
    expect(countQuery).not.toContain("ORDER BY");
  });

  it("count strips OFFSET LIMIT from query", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const baseSpec = qb.offset(10).limit(20).toQuerySpec();
    expect(baseSpec.query).toContain("OFFSET 10 LIMIT 20");
    const countQuery = baseSpec.query
      .replace(/SELECT\s+(TOP\s+\d+\s+)?.+?\s+FROM/i, "SELECT VALUE COUNT(1) FROM")
      .replace(/\s+ORDER BY\s+.+$/i, "")
      .replace(/\s+OFFSET\s+\d+\s+LIMIT\s+\d+$/i, "");
    expect(countQuery).not.toContain("OFFSET");
    expect(countQuery).not.toContain("LIMIT");
  });

  it("count with WHERE preserves conditions", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const baseSpec = qb.where("name", "=", "Alice").toQuerySpec();
    const countQuery = baseSpec.query.replace(
      /SELECT\s+(TOP\s+\d+\s+)?.+?\s+FROM/i,
      "SELECT VALUE COUNT(1) FROM",
    );
    expect(countQuery).toBe("SELECT VALUE COUNT(1) FROM c WHERE c.name = @p0");
  });
});
