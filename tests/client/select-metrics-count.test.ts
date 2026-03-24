import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CosmioContainer } from "../../src/client/cosmio-container.js";
import { QueryBuilder } from "../../src/client/query-builder.js";
import { defineModel } from "../../src/model/define-model.js";

const UserModel = defineModel({
  name: "User",
  container: "users",
  partitionKey: ["/tenantId"],
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    name: z.string(),
    email: z.string(),
    age: z.number(),
    role: z.string(),
  }),
});

// ---------- Select / Projection ----------

describe("select()", () => {
  it("generates SELECT with specific fields", () => {
    const qb = new QueryBuilder(null as never, UserModel);
    const spec = qb.select("id", "name").toQuerySpec();
    expect(spec.query).toBe("SELECT c.id, c.name FROM c");
  });

  it("works with where + select", () => {
    const qb = new QueryBuilder(null as never, UserModel);
    const spec = qb.where({ role: "admin" }).select("id", "email").toQuerySpec();
    expect(spec.query).toBe("SELECT c.id, c.email FROM c WHERE c.role = @p0");
  });

  it("works with select + orderBy + limit", () => {
    const qb = new QueryBuilder(null as never, UserModel);
    const spec = qb.select("id", "name", "age").orderBy("age", "DESC").limit(5).toQuerySpec();
    expect(spec.query).toBe(
      "SELECT c.id, c.name, c.age FROM c ORDER BY c.age DESC OFFSET 0 LIMIT 5",
    );
  });

  it("without select uses SELECT *", () => {
    const qb = new QueryBuilder(null as never, UserModel);
    const spec = qb.toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c");
  });
});

// ---------- Count ----------

describe("count()", () => {
  it("generates COUNT query", async () => {
    const fetchAllFn = vi.fn(async () => ({ resources: [42] }));
    const queryFn = vi.fn(() => ({ fetchAll: fetchAllFn }));
    const mockContainer = { items: { query: queryFn } };
    const qb = new QueryBuilder(mockContainer as never, UserModel, ["t1"]);

    const count = await qb.where({ role: "admin" }).count();

    expect(count).toBe(42);
    const querySpec = queryFn.mock.calls[0] as unknown[];
    const spec = querySpec[0] as { query: string };
    expect(spec.query).toContain("SELECT VALUE COUNT(1) FROM c");
    expect(spec.query).toContain("WHERE");
  });

  it("returns 0 when no results", async () => {
    const fetchAllFn = vi.fn(async () => ({ resources: [] }));
    const queryFn = vi.fn(() => ({ fetchAll: fetchAllFn }));
    const mockContainer = { items: { query: queryFn } };
    const qb = new QueryBuilder(mockContainer as never, UserModel);

    const count = await qb.count();
    expect(count).toBe(0);
  });

  it("count without filters", async () => {
    const fetchAllFn = vi.fn(async () => ({ resources: [100] }));
    const queryFn = vi.fn(() => ({ fetchAll: fetchAllFn }));
    const mockContainer = { items: { query: queryFn } };
    const qb = new QueryBuilder(mockContainer as never, UserModel, ["t1"]);

    const count = await qb.count();
    expect(count).toBe(100);

    const querySpec = queryFn.mock.calls[0] as unknown[];
    const spec = querySpec[0] as { query: string };
    expect(spec.query).toBe("SELECT VALUE COUNT(1) FROM c");
  });
});

// ---------- RU Telemetry ----------

describe("*WithMetrics()", () => {
  it("createWithMetrics returns result + ru", async () => {
    const mockContainer = {
      items: {
        create: vi.fn(async (doc: unknown) => ({
          resource: doc,
          headers: { "x-ms-request-charge": 5.2 },
        })),
      },
    };
    const container = new CosmioContainer(mockContainer as never, UserModel);

    const { result, ru } = await container.createWithMetrics({
      id: "u1",
      tenantId: "t1",
      name: "Alice",
      email: "a@b.com",
      age: 30,
      role: "admin",
    });

    expect(result.id).toBe("u1");
    expect(ru).toBe(5.2);
  });

  it("findByIdWithMetrics returns result + ru", async () => {
    const mockContainer = {
      item: vi.fn(() => ({
        read: vi.fn(async () => ({
          resource: { id: "u1", tenantId: "t1", name: "A", email: "a@b", age: 1, role: "x" },
          headers: { "x-ms-request-charge": 1.0 },
        })),
      })),
    };
    const container = new CosmioContainer(mockContainer as never, UserModel);

    const { result, ru } = await container.findByIdWithMetrics("u1", ["t1"]);

    expect(result).toBeDefined();
    expect(result!.name).toBe("A");
    expect(ru).toBe(1.0);
  });

  it("findByIdWithMetrics returns undefined + ru for missing doc", async () => {
    const mockContainer = {
      item: vi.fn(() => ({
        read: vi.fn(async () => ({
          resource: undefined,
          headers: { "x-ms-request-charge": 1.0 },
        })),
      })),
    };
    const container = new CosmioContainer(mockContainer as never, UserModel);

    const { result, ru } = await container.findByIdWithMetrics("missing", ["t1"]);

    expect(result).toBeUndefined();
    expect(ru).toBe(1.0);
  });

  it("upsertWithMetrics returns result + ru", async () => {
    const mockContainer = {
      items: {
        upsert: vi.fn(async (doc: unknown) => ({
          resource: doc,
          headers: { "x-ms-request-charge": 6.8 },
        })),
      },
    };
    const container = new CosmioContainer(mockContainer as never, UserModel);

    const { result, ru } = await container.upsertWithMetrics({
      id: "u1",
      tenantId: "t1",
      name: "Bob",
      email: "b@b.com",
      age: 25,
      role: "user",
    });

    expect(result.name).toBe("Bob");
    expect(ru).toBe(6.8);
  });

  it("deleteWithMetrics returns ru", async () => {
    const mockContainer = {
      item: vi.fn(() => ({
        delete: vi.fn(async () => ({
          headers: { "x-ms-request-charge": 5.0 },
        })),
      })),
    };
    const container = new CosmioContainer(mockContainer as never, UserModel);

    const { ru } = await container.deleteWithMetrics("u1", ["t1"]);
    expect(ru).toBe(5.0);
  });

  it("handles string RU header", async () => {
    const mockContainer = {
      items: {
        create: vi.fn(async (doc: unknown) => ({
          resource: doc,
          headers: { "x-ms-request-charge": "3.14" },
        })),
      },
    };
    const container = new CosmioContainer(mockContainer as never, UserModel);

    const { ru } = await container.createWithMetrics({
      id: "u1",
      tenantId: "t1",
      name: "C",
      email: "c@c",
      age: 1,
      role: "x",
    });
    expect(ru).toBe(3.14);
  });
});
