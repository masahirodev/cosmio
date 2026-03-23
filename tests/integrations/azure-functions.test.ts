import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CosmioContainer } from "../../src/client/cosmio-container.js";
import {
  cosmioV3,
  getCosmioContext,
  getInvocationCache,
  withCosmioContext,
} from "../../src/integrations/azure-functions.js";
import { defineModel } from "../../src/model/define-model.js";

const Model = defineModel({
  name: "Test",
  container: "test",
  partitionKey: ["/tenantId"],
  schema: z.object({ id: z.string(), tenantId: z.string(), value: z.string() }),
});

describe("withCosmioContext", () => {
  it("provides invocation cache within context", () => {
    withCosmioContext(() => {
      const cache = getInvocationCache();
      expect(cache).toBeDefined();
    });
  });

  it("cache is isolated between contexts", () => {
    withCosmioContext(() => {
      const cache = getInvocationCache()!;
      cache.set("k1", "v1");
    });

    withCosmioContext(() => {
      const cache = getInvocationCache()!;
      expect(cache.get("k1")).toBeUndefined(); // different context
    });
  });

  it("context has invocationId", () => {
    withCosmioContext(() => {
      const ctx = getCosmioContext();
      expect(ctx).toBeDefined();
      expect(typeof ctx!.invocationId).toBe("string");
    });
  });

  it("accepts custom invocationId", () => {
    withCosmioContext(() => {
      const ctx = getCosmioContext();
      expect(ctx!.invocationId).toBe("custom-123");
    }, "custom-123");
  });

  it("returns undefined outside context", () => {
    expect(getInvocationCache()).toBeUndefined();
    expect(getCosmioContext()).toBeUndefined();
  });
});

describe("auto-cache via AsyncLocalStorage", () => {
  it("findById uses invocation cache automatically", async () => {
    const readFn = vi.fn(async () => ({
      resource: { id: "u1", tenantId: "t1", value: "hello" },
    }));
    const mockContainer = { item: vi.fn(() => ({ read: readFn })) };
    const container = new CosmioContainer(mockContainer as never, Model);

    await withCosmioContext(async () => {
      await container.findById("u1", ["t1"]); // DB hit
      await container.findById("u1", ["t1"]); // cached
      expect(readFn).toHaveBeenCalledTimes(1);
    });
  });

  it("different invocations don't share cache", async () => {
    const readFn = vi.fn(async () => ({
      resource: { id: "u1", tenantId: "t1", value: "hello" },
    }));
    const mockContainer = { item: vi.fn(() => ({ read: readFn })) };
    const container = new CosmioContainer(mockContainer as never, Model);

    await withCosmioContext(async () => {
      await container.findById("u1", ["t1"]);
    });

    await withCosmioContext(async () => {
      await container.findById("u1", ["t1"]);
    });

    // Each invocation hits DB
    expect(readFn).toHaveBeenCalledTimes(2);
  });

  it("no cache outside context", async () => {
    const readFn = vi.fn(async () => ({
      resource: { id: "u1", tenantId: "t1", value: "hello" },
    }));
    const mockContainer = { item: vi.fn(() => ({ read: readFn })) };
    const container = new CosmioContainer(mockContainer as never, Model);

    await container.findById("u1", ["t1"]);
    await container.findById("u1", ["t1"]);

    expect(readFn).toHaveBeenCalledTimes(2);
  });
});

describe("cosmioV3 — Azure Functions v3 wrapper", () => {
  it("provides invocation context within v3 handler", async () => {
    let capturedCtx: ReturnType<typeof getCosmioContext>;

    const handler = cosmioV3(async (_context: { invocationId: string }) => {
      capturedCtx = getCosmioContext();
      return "done";
    });

    await handler({ invocationId: "v3-abc" });
    expect(capturedCtx!).toBeDefined();
    expect(capturedCtx!.invocationId).toBe("v3-abc");
  });

  it("provides per-invocation cache in v3", async () => {
    const readFn = vi.fn(async () => ({
      resource: { id: "u1", tenantId: "t1", value: "v" },
    }));
    const mockContainer = { item: vi.fn(() => ({ read: readFn })) };
    const container = new CosmioContainer(mockContainer as never, Model);

    const handler = cosmioV3(async (_context: unknown) => {
      await container.findById("u1", ["t1"]);
      await container.findById("u1", ["t1"]); // should be cached
    });

    await handler({ invocationId: "v3-test" });
    expect(readFn).toHaveBeenCalledTimes(1); // cached
  });

  it("v3 invocations are isolated", async () => {
    const readFn = vi.fn(async () => ({
      resource: { id: "u1", tenantId: "t1", value: "v" },
    }));
    const mockContainer = { item: vi.fn(() => ({ read: readFn })) };
    const container = new CosmioContainer(mockContainer as never, Model);

    const handler = cosmioV3(async (_context: unknown) => {
      await container.findById("u1", ["t1"]);
    });

    await handler({ invocationId: "inv-1" });
    await handler({ invocationId: "inv-2" });
    expect(readFn).toHaveBeenCalledTimes(2); // each invocation hits DB
  });
});

describe("query result cache via AsyncLocalStorage", () => {
  function createMockQueryContainer() {
    const fetchAllFn = vi.fn(async () => ({
      resources: [
        { id: "u1", tenantId: "t1", value: "a" },
        { id: "u2", tenantId: "t1", value: "b" },
      ],
    }));
    const queryFn = vi.fn(() => ({ fetchAll: fetchAllFn }));
    const mockContainer = { items: { query: queryFn } };
    const container = new CosmioContainer(mockContainer as never, Model);
    return { container, queryFn, fetchAllFn };
  }

  it("same query within invocation is cached", async () => {
    const { container, fetchAllFn } = createMockQueryContainer();

    await withCosmioContext(async () => {
      const r1 = await container.find(["t1"]).where({ value: "a" }).exec();
      const r2 = await container.find(["t1"]).where({ value: "a" }).exec();

      expect(r1).toEqual(r2);
      expect(fetchAllFn).toHaveBeenCalledTimes(1); // only 1 DB call
    });
  });

  it("different queries are not cached together", async () => {
    const { container, fetchAllFn } = createMockQueryContainer();

    await withCosmioContext(async () => {
      await container.find(["t1"]).where({ value: "a" }).exec();
      await container.find(["t1"]).where({ value: "b" }).exec(); // different param

      expect(fetchAllFn).toHaveBeenCalledTimes(2);
    });
  });

  it("different partition keys are not cached together", async () => {
    const { container, fetchAllFn } = createMockQueryContainer();

    await withCosmioContext(async () => {
      await container.find(["t1"]).where({ value: "a" }).exec();
      await container.find(["t2"]).where({ value: "a" }).exec(); // different PK

      expect(fetchAllFn).toHaveBeenCalledTimes(2);
    });
  });

  it("query cache does not leak across invocations", async () => {
    const { container, fetchAllFn } = createMockQueryContainer();

    await withCosmioContext(async () => {
      await container.find(["t1"]).where({ value: "a" }).exec();
    });

    await withCosmioContext(async () => {
      await container.find(["t1"]).where({ value: "a" }).exec();
    });

    // Each invocation hits DB independently
    expect(fetchAllFn).toHaveBeenCalledTimes(2);
  });

  it("query cache not active outside context", async () => {
    const { container, fetchAllFn } = createMockQueryContainer();

    await container.find(["t1"]).exec();
    await container.find(["t1"]).exec();

    // No context → no cache → 2 DB calls
    expect(fetchAllFn).toHaveBeenCalledTimes(2);
  });

  it("find() without where is also cached", async () => {
    const { container, fetchAllFn } = createMockQueryContainer();

    await withCosmioContext(async () => {
      await container.find(["t1"]).exec();
      await container.find(["t1"]).exec();

      expect(fetchAllFn).toHaveBeenCalledTimes(1);
    });
  });

  it("orderBy/limit changes cache key", async () => {
    const { container, fetchAllFn } = createMockQueryContainer();

    await withCosmioContext(async () => {
      await container.find(["t1"]).limit(10).exec();
      await container.find(["t1"]).limit(20).exec(); // different limit

      expect(fetchAllFn).toHaveBeenCalledTimes(2);
    });
  });

  it("findById cache is separate from query cache", async () => {
    const readFn = vi.fn(async () => ({
      resource: { id: "u1", tenantId: "t1", value: "hello" },
    }));
    const fetchAllFn = vi.fn(async () => ({
      resources: [{ id: "u1", tenantId: "t1", value: "hello" }],
    }));
    const mockContainer = {
      item: vi.fn(() => ({ read: readFn })),
      items: { query: vi.fn(() => ({ fetchAll: fetchAllFn })) },
    };
    const container = new CosmioContainer(mockContainer as never, Model);

    await withCosmioContext(async () => {
      // Point read and query both execute
      await container.findById("u1", ["t1"]);
      await container.find(["t1"]).where({ id: "u1" }).exec();

      expect(readFn).toHaveBeenCalledTimes(1);
      expect(fetchAllFn).toHaveBeenCalledTimes(1);

      // Repeat — both cached
      await container.findById("u1", ["t1"]);
      await container.find(["t1"]).where({ id: "u1" }).exec();

      expect(readFn).toHaveBeenCalledTimes(1);
      expect(fetchAllFn).toHaveBeenCalledTimes(1);
    });
  });

  it("write invalidates findById cache but not query cache", async () => {
    const readFn = vi.fn(async () => ({
      resource: { id: "u1", tenantId: "t1", value: "v" },
    }));
    const upsertFn = vi.fn(async (doc: unknown) => ({ resource: doc }));
    const mockContainer = {
      item: vi.fn(() => ({ read: readFn })),
      items: {
        upsert: upsertFn,
        query: vi.fn(() => ({
          fetchAll: vi.fn(async () => ({ resources: [] })),
        })),
      },
    };
    const container = new CosmioContainer(mockContainer as never, Model);

    await withCosmioContext(async () => {
      await container.findById("u1", ["t1"]); // cached
      expect(readFn).toHaveBeenCalledTimes(1);

      // Upsert should invalidate point-read cache
      await container.upsert({ id: "u1", tenantId: "t1", value: "updated" });

      await container.findById("u1", ["t1"]); // should re-fetch
      expect(readFn).toHaveBeenCalledTimes(2);
    });
  });
});

describe("field descriptions", () => {
  it("extracts .describe() from Zod schema", () => {
    const DescModel = defineModel({
      name: "Desc",
      container: "desc",
      partitionKey: ["/tenantId"],
      schema: z.object({
        id: z.string().describe("Unique document identifier"),
        tenantId: z.string().describe("Tenant partition key"),
        name: z.string().describe("User display name"),
        age: z.number().optional().describe("User age"),
        raw: z.string(),
      }),
    });

    expect(DescModel.fieldDescriptions.id).toBe("Unique document identifier");
    expect(DescModel.fieldDescriptions.tenantId).toBe("Tenant partition key");
    expect(DescModel.fieldDescriptions.name).toBe("User display name");
    expect(DescModel.fieldDescriptions.age).toBe("User age");
    expect(DescModel.fieldDescriptions.raw).toBeUndefined();
  });
});
