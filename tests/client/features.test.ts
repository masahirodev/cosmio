import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ReadCache } from "../../src/client/cache.js";
import { CosmioContainer } from "../../src/client/cosmio-container.js";
import { HookRegistry } from "../../src/client/hooks.js";
import { defineModel } from "../../src/model/define-model.js";
import { defineRepository } from "../../src/model/repository.js";

// ---------- Soft Delete ----------

describe("Soft Delete", () => {
  const SoftModel = defineModel({
    name: "SoftDoc",
    container: "docs",
    partitionKey: ["/tenantId"],
    softDelete: { field: "deletedAt" },
    schema: z.object({
      id: z.string(),
      tenantId: z.string(),
      name: z.string(),
      deletedAt: z.number().optional(),
    }),
  });

  it("model stores soft delete config with autoExclude=true by default", () => {
    expect(SoftModel.softDelete).toEqual({ field: "deletedAt", autoExclude: true });
  });

  it("delete() patches deletedAt instead of removing", async () => {
    const patchFn = vi.fn(async () => ({ resource: {} }));
    const mockContainer = {
      item: vi.fn(() => ({ patch: patchFn })),
    };
    const container = new CosmioContainer(mockContainer as never, SoftModel);

    await container.delete("doc-1", ["t1"]);

    expect(patchFn).toHaveBeenCalledOnce();
    const arg = (patchFn.mock.calls[0] as unknown[])[0] as {
      operations: { op: string; path: string; value: unknown }[];
    };
    expect(arg.operations[0]!.op).toBe("set");
    expect(arg.operations[0]!.path).toBe("/deletedAt");
    expect(typeof arg.operations[0]!.value).toBe("number");
  });

  it("hardDelete() physically removes", async () => {
    const deleteFn = vi.fn(async () => ({}));
    const mockContainer = {
      item: vi.fn(() => ({ delete: deleteFn })),
    };
    const container = new CosmioContainer(mockContainer as never, SoftModel);

    await container.hardDelete("doc-1", ["t1"]);
    expect(deleteFn).toHaveBeenCalledOnce();
  });

  it("findById() returns undefined for soft-deleted docs", async () => {
    const mockContainer = {
      item: vi.fn(() => ({
        read: vi.fn(async () => ({
          resource: { id: "doc-1", tenantId: "t1", name: "X", deletedAt: 123456 },
        })),
      })),
    };
    const container = new CosmioContainer(mockContainer as never, SoftModel);

    const result = await container.findById("doc-1", ["t1"]);
    expect(result).toBeUndefined();
  });

  it("findWithDeleted() includes soft-deleted docs in query", () => {
    const mockContainer = {
      items: {
        query: vi.fn(() => ({
          fetchAll: vi.fn(async () => ({
            resources: [
              { id: "1", tenantId: "t1", name: "Active" },
              { id: "2", tenantId: "t1", name: "Deleted", deletedAt: 123 },
            ],
          })),
        })),
      },
    };
    const container = new CosmioContainer(mockContainer as never, SoftModel);

    // findWithDeleted should NOT add the soft delete filter
    const qb = container.findWithDeleted(["t1"]);
    const spec = qb.toQuerySpec();
    expect(spec.query).not.toContain("NOT IS_DEFINED");
  });

  it("find() auto-excludes soft-deleted docs in query", () => {
    const container = new CosmioContainer(null as never, SoftModel);
    const qb = container.find(["t1"]);
    const spec = qb.toQuerySpec();
    expect(spec.query).toContain("NOT IS_DEFINED(c.deletedAt)");
  });

  it("findByIdWithMetrics() treats deletedAt=null as not deleted and returns the document", async () => {
    const mockContainer = {
      item: vi.fn(() => ({
        read: vi.fn(async () => ({
          resource: { id: "doc-1", tenantId: "t1", name: "X", deletedAt: null },
          headers: { "x-ms-request-charge": "3.5" },
        })),
      })),
    };
    const container = new CosmioContainer(mockContainer as never, SoftModel);

    const { result, ru } = await container.findByIdWithMetrics("doc-1", ["t1"]);
    // null is treated like undefined (loose equality: null != null is false)
    expect(result).toBeDefined();
    expect(result!.name).toBe("X");
    expect(ru).toBeGreaterThanOrEqual(0);
  });

  it("findByIdWithMetrics() returns document when deletedAt is undefined (field absent)", async () => {
    const mockContainer = {
      item: vi.fn(() => ({
        read: vi.fn(async () => ({
          resource: { id: "doc-1", tenantId: "t1", name: "Active" },
          headers: { "x-ms-request-charge": "3.5" },
        })),
      })),
    };
    const container = new CosmioContainer(mockContainer as never, SoftModel);

    const { result, ru } = await container.findByIdWithMetrics("doc-1", ["t1"]);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Active");
    expect(ru).toBeGreaterThanOrEqual(0);
  });

  it("restore() removes the deletedAt field", async () => {
    const patchFn = vi.fn(async () => ({
      resource: { id: "doc-1", tenantId: "t1", name: "Restored" },
    }));
    const mockContainer = {
      item: vi.fn(() => ({ patch: patchFn })),
    };
    const container = new CosmioContainer(mockContainer as never, SoftModel);

    const result = await container.restore("doc-1", ["t1"]);
    expect(result).toBeDefined();
    const restoreArg = (patchFn.mock.calls[0] as unknown[])[0] as {
      operations: { op: string; path: string }[];
    };
    expect(restoreArg.operations).toEqual([{ op: "remove", path: "/deletedAt" }]);
  });
});

// ---------- Hooks ----------

describe("Hooks", () => {
  it("fires beforeCreate and afterCreate", async () => {
    const Model = defineModel({
      name: "Hooked",
      container: "hooked",
      partitionKey: ["/tenantId"],
      schema: z.object({ id: z.string(), tenantId: z.string(), createdBy: z.string().optional() }),
    });

    const mockContainer = {
      items: { create: vi.fn(async (doc: unknown) => ({ resource: doc })) },
    };
    const container = new CosmioContainer(mockContainer as never, Model);

    const log: string[] = [];
    container
      .use("beforeCreate", (doc) => {
        doc.createdBy = "system";
        log.push("before");
      })
      .use("afterCreate", () => {
        log.push("after");
      });

    await container.create({ id: "1", tenantId: "t1" });

    expect(log).toEqual(["before", "after"]);
    const callArgs = mockContainer.items.create.mock.calls[0] as unknown[];
    const created = callArgs[0] as Record<string, unknown>;
    expect(created.createdBy).toBe("system");
  });

  it("HookRegistry runs multiple hooks in order", async () => {
    const registry = new HookRegistry();
    const order: number[] = [];

    registry.on("afterRead", () => {
      order.push(1);
    });
    registry.on("afterRead", () => {
      order.push(2);
    });

    await registry.run("afterRead", {});
    expect(order).toEqual([1, 2]);
  });
});

// ---------- Scope (Request-scoped Cache) ----------

describe("scope() — request-scoped cache", () => {
  const Model = defineModel({
    name: "Cached",
    container: "cached",
    partitionKey: ["/tenantId"],
    schema: z.object({ id: z.string(), tenantId: z.string(), value: z.string() }),
  });

  it("second findById returns cached result (no DB call)", async () => {
    const readFn = vi.fn(async () => ({
      resource: { id: "c1", tenantId: "t1", value: "hello" },
    }));
    const mockContainer = {
      item: vi.fn(() => ({ read: readFn })),
    };
    const base = new CosmioContainer(mockContainer as never, Model);
    const scoped = base.scope();

    await scoped.findById("c1", ["t1"]);
    await scoped.findById("c1", ["t1"]);

    // Only 1 DB call — second was cached
    expect(readFn).toHaveBeenCalledTimes(1);
  });

  it("different scope instances don't share cache", async () => {
    const readFn = vi.fn(async () => ({
      resource: { id: "c1", tenantId: "t1", value: "v" },
    }));
    const mockContainer = {
      item: vi.fn(() => ({ read: readFn })),
    };
    const base = new CosmioContainer(mockContainer as never, Model);

    const scope1 = base.scope();
    const scope2 = base.scope();

    await scope1.findById("c1", ["t1"]);
    await scope2.findById("c1", ["t1"]);

    // Each scope hits DB independently
    expect(readFn).toHaveBeenCalledTimes(2);
  });

  it("base container has no cache by default", async () => {
    const readFn = vi.fn(async () => ({
      resource: { id: "c1", tenantId: "t1", value: "v" },
    }));
    const mockContainer = {
      item: vi.fn(() => ({ read: readFn })),
    };
    const base = new CosmioContainer(mockContainer as never, Model);

    await base.findById("c1", ["t1"]);
    await base.findById("c1", ["t1"]);

    // No cache → 2 DB calls
    expect(readFn).toHaveBeenCalledTimes(2);
  });
});

// ---------- ReadCache unit ----------

describe("ReadCache", () => {
  it("get/set/invalidate", () => {
    const cache = new ReadCache({ ttlMs: 1000 });
    cache.set("k1", "v1");
    expect(cache.get("k1")).toBe("v1");

    cache.invalidate("k1");
    expect(cache.get("k1")).toBeUndefined();
  });

  it("expires after TTL", async () => {
    const cache = new ReadCache({ ttlMs: 50 });
    cache.set("k1", "v1");
    expect(cache.get("k1")).toBe("v1");

    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get("k1")).toBeUndefined();
  });

  it("evicts oldest when maxSize reached", () => {
    const cache = new ReadCache({ maxSize: 2 });
    cache.set("k1", "v1");
    cache.set("k2", "v2");
    cache.set("k3", "v3"); // should evict k1

    expect(cache.get("k1")).toBeUndefined();
    expect(cache.get("k2")).toBe("v2");
    expect(cache.get("k3")).toBe("v3");
  });

  it("buildKey creates deterministic keys", () => {
    expect(ReadCache.buildKey("users", "u1", ["t1"])).toBe('users\0u1\0["t1"]');
    expect(ReadCache.buildKey("docs", "d1", ["t1", "s1"])).toBe('docs\0d1\0["t1","s1"]');
  });

  it("invalidateByPrefix removes only matching-prefix keys and keeps others", () => {
    const cache = new ReadCache({ ttlMs: 10000 });
    cache.set("query::users::SELECT * FROM c", "result1");
    cache.set("query::users::SELECT id FROM c", "result2");
    cache.set("query::orders::SELECT * FROM c", "result3");
    cache.set("point::users::u1", "result4");

    cache.invalidateByPrefix("query::users::");

    expect(cache.get("query::users::SELECT * FROM c")).toBeUndefined();
    expect(cache.get("query::users::SELECT id FROM c")).toBeUndefined();
    expect(cache.get("query::orders::SELECT * FROM c")).toBe("result3");
    expect(cache.get("point::users::u1")).toBe("result4");
  });

  it("default TTL is Infinity — entries never expire", async () => {
    const cache = new ReadCache(); // no options
    cache.set("k1", "v1");
    await new Promise((r) => setTimeout(r, 100));
    expect(cache.get("k1")).toBe("v1"); // still alive
  });
});

// ---------- Patch wrapper ----------

describe("patch() wraps array into object form", () => {
  const PatchModel = defineModel({
    name: "PatchTest",
    container: "patch-test",
    partitionKey: ["/tenantId"],
    schema: z.object({
      id: z.string(),
      tenantId: z.string(),
      name: z.string(),
    }),
  });

  it("wraps array operations into { operations } object", async () => {
    const patchFn = vi.fn(async () => ({
      resource: { id: "1", tenantId: "t1", name: "patched" },
    }));
    const mockContainer = {
      item: vi.fn(() => ({ patch: patchFn })),
    };
    const container = new CosmioContainer(mockContainer as never, PatchModel);

    await container.patch("1", ["t1"], [{ op: "set", path: "/name", value: "patched" }]);

    const arg = (patchFn.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(arg).toHaveProperty("operations");
    expect(Array.isArray(arg)).toBe(false);
    expect(arg.operations).toEqual([{ op: "set", path: "/name", value: "patched" }]);
  });

  it("passes object form through unchanged", async () => {
    const patchFn = vi.fn(async () => ({
      resource: { id: "1", tenantId: "t1", name: "patched" },
    }));
    const mockContainer = {
      item: vi.fn(() => ({ patch: patchFn })),
    };
    const container = new CosmioContainer(mockContainer as never, PatchModel);

    await container.patch("1", ["t1"], {
      operations: [{ op: "set", path: "/name", value: "patched" }],
    });

    const arg = (patchFn.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(arg).toHaveProperty("operations");
  });
});

// ---------- Repository ----------

describe("defineRepository", () => {
  const UserModel = defineModel({
    name: "User",
    container: "users",
    partitionKey: ["/tenantId"],
    schema: z.object({
      id: z.string(),
      tenantId: z.string(),
      email: z.string(),
      name: z.string(),
    }),
  });

  it("adds custom methods while preserving base CRUD", () => {
    const mockContainer = {
      items: {
        create: vi.fn(async (doc: unknown) => ({ resource: doc })),
        query: vi.fn(() => ({
          fetchAll: vi.fn(async () => ({
            resources: [{ id: "u1", tenantId: "t1", email: "a@b.com", name: "A" }],
          })),
        })),
      },
    };

    const UserRepo = defineRepository(UserModel, (c) => ({
      findByEmail: async (tenant: string, email: string) => {
        const results = await c.find([tenant]).where("email", "=", email).exec();
        return results[0];
      },
    }));

    const container = new CosmioContainer(mockContainer as never, UserModel);
    const users = UserRepo(container);

    // Custom method exists
    expect(typeof users.findByEmail).toBe("function");
    // Base method still exists
    expect(typeof users.create).toBe("function");
    expect(typeof users.findById).toBe("function");
  });
});
