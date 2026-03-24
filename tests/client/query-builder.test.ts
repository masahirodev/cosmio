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

  it("generates OFFSET/LIMIT with limit", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.limit(10).toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c OFFSET 0 LIMIT 10");
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
      "SELECT * FROM c WHERE CONTAINS(c.name, @p0) AND c.score >= @p1 ORDER BY c.createdAt DESC OFFSET 0 LIMIT 5",
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

  it("limit(0) generates OFFSET 0 LIMIT 0", () => {
    const qb = new QueryBuilder(null as never, TestModel);
    const spec = qb.limit(0).toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c OFFSET 0 LIMIT 0");
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
});
