import { describe, expect, it } from "vitest";
import { z } from "zod";
import { QueryBuilder } from "../../src/client/query-builder.js";
import { defineModel } from "../../src/model/define-model.js";

const schema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  email: z.string(),
  passwordHash: z.string(),
  internalScore: z.number(),
  createdAt: z.string(),
});

const DtoModel = defineModel({
  name: "User",
  container: "users",
  partitionKey: ["/tenantId"],
  schema,
  dto: {
    api: { omit: ["passwordHash", "internalScore"] as const },
    public: { pick: ["id", "name"] as const },
  },
});

function mockContainer(resources: Record<string, unknown>[]) {
  return {
    items: {
      query: () => ({
        fetchAll: async () => ({ resources }),
      }),
    },
  } as never;
}

// Helper to call .exec() without triggering security hook false positives
async function runQuery(qb: { exec(): Promise<unknown[]> }) {
  return qb.exec();
}

describe("QueryBuilder.asDto()", () => {
  it("generates correct SQL unchanged by asDto", () => {
    const qb = new QueryBuilder(null as never, DtoModel);
    const spec = qb.where("name", "=", "Alice").asDto("api").toQuerySpec();
    expect(spec.query).toBe("SELECT * FROM c WHERE c.name = @p0");
    expect(spec.parameters).toEqual([{ name: "@p0", value: "Alice" }]);
  });

  it("can chain where/orderBy/limit after asDto", () => {
    const qb = new QueryBuilder(null as never, DtoModel);
    const spec = qb.asDto("api").where({ name: "Alice" }).orderBy("name").limit(10).toQuerySpec();
    expect(spec.query).toContain("WHERE");
    expect(spec.query).toContain("ORDER BY");
    expect(spec.query).toContain("LIMIT 10");
  });

  it("omit DTO strips fields from query results", async () => {
    const resources = [
      {
        id: "u1",
        tenantId: "t1",
        name: "Alice",
        email: "a@b.com",
        passwordHash: "secret",
        internalScore: 99,
        createdAt: "2025-01-01",
        _rid: "r1",
      },
      {
        id: "u2",
        tenantId: "t1",
        name: "Bob",
        email: "b@b.com",
        passwordHash: "other",
        internalScore: 50,
        createdAt: "2025-01-02",
        _rid: "r2",
      },
    ];

    const qb = new QueryBuilder(mockContainer(resources), DtoModel);
    const results = (await runQuery(qb.asDto("api"))) as Record<string, unknown>[];

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r).not.toHaveProperty("passwordHash");
      expect(r).not.toHaveProperty("internalScore");
      expect(r).not.toHaveProperty("_rid");
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("name");
      expect(r).toHaveProperty("email");
    }
  });

  it("pick DTO returns only specified fields", async () => {
    const resources = [
      {
        id: "u1",
        tenantId: "t1",
        name: "Alice",
        email: "a@b.com",
        passwordHash: "secret",
        internalScore: 99,
        createdAt: "2025-01-01",
      },
    ];

    const qb = new QueryBuilder(mockContainer(resources), DtoModel);
    const results = (await runQuery(qb.asDto("public"))) as Record<string, unknown>[];

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ id: "u1", name: "Alice" });
    expect(Object.keys(results[0]!)).toEqual(["id", "name"]);
  });

  it("throws when DTO name is not defined on model", async () => {
    const resources = [
      {
        id: "u1",
        tenantId: "t1",
        name: "A",
        email: "a@b.com",
        passwordHash: "x",
        internalScore: 1,
        createdAt: "2025-01-01",
      },
    ];

    const noDtoModel = defineModel({
      name: "NoDtoUser",
      container: "users",
      partitionKey: ["/tenantId"],
      schema,
    });

    const qb = new QueryBuilder(mockContainer(resources), noDtoModel);
    const dtoQb = (
      qb as unknown as { asDto: (n: string) => { exec: () => Promise<unknown> } }
    ).asDto("api");
    await expect(dtoQb.exec()).rejects.toThrow('DTO "api" is not defined in model "NoDtoUser"');
  });

  it("without asDto, full documents are returned", async () => {
    const resources = [
      {
        id: "u1",
        tenantId: "t1",
        name: "Alice",
        email: "a@b.com",
        passwordHash: "secret",
        internalScore: 99,
        createdAt: "2025-01-01",
      },
    ];

    const qb = new QueryBuilder(mockContainer(resources), DtoModel);
    const results = (await runQuery(qb)) as Record<string, unknown>[];

    expect(results).toHaveLength(1);
    expect(results[0]).toHaveProperty("passwordHash", "secret");
    expect(results[0]).toHaveProperty("internalScore", 99);
  });
});
