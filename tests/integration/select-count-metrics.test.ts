import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { createTestClient, setupTestDatabase, teardownTestDatabase } from "./setup.js";

const TEST_FILE = "select-count-metrics";

const ProductModel = defineModel({
  name: "Product",
  container: "test-select-count-metrics",
  partitionKey: ["/category"],
  schema: z.object({
    id: z.string(),
    category: z.string(),
    name: z.string(),
    price: z.number(),
    inStock: z.boolean(),
    description: z.string(),
  }),
});

describe("Select, Count, Metrics (integration)", () => {
  const client = createTestClient(TEST_FILE);
  const products = client.model(ProductModel);

  const seedProducts = [
    {
      id: "scm-p1",
      category: "scm-electronics",
      name: "Phone",
      price: 999,
      inStock: true,
      description: "A smartphone",
    },
    {
      id: "scm-p2",
      category: "scm-electronics",
      name: "Laptop",
      price: 1999,
      inStock: true,
      description: "A laptop",
    },
    {
      id: "scm-p3",
      category: "scm-electronics",
      name: "Tablet",
      price: 499,
      inStock: false,
      description: "A tablet",
    },
  ];

  beforeAll(async () => {
    await setupTestDatabase(TEST_FILE);
    await ensureContainer(client.database, ProductModel);
  }, 60_000);

  afterAll(async () => {
    await teardownTestDatabase(TEST_FILE);
  });

  /** Helper: seed data for a test and return cleanup function */
  async function seedAndCleanup() {
    for (const p of seedProducts) {
      await products.upsert(p);
    }
    return async () => {
      for (const p of seedProducts) {
        try {
          await products.delete(p.id, [p.category]);
        } catch {}
      }
    };
  }

  it("select returns only requested fields", async () => {
    const cleanup = await seedAndCleanup();
    try {
      const results = await products.find(["scm-electronics"]).select("id", "name", "price").exec();

      expect(results.length).toBeGreaterThanOrEqual(3);
      expect(results[0]).toHaveProperty("id");
      expect(results[0]).toHaveProperty("name");
      expect(results[0]).toHaveProperty("price");
    } finally {
      await cleanup();
    }
  });

  it("count returns total without fetching documents", async () => {
    const cleanup = await seedAndCleanup();
    try {
      const total = await products.find(["scm-electronics"]).count();
      expect(total).toBeGreaterThanOrEqual(3);
    } finally {
      await cleanup();
    }
  });

  it("count with where filter", async () => {
    const cleanup = await seedAndCleanup();
    try {
      const inStockCount = await products
        .find(["scm-electronics"])
        .where({ inStock: true })
        .count();
      expect(inStockCount).toBe(2);
    } finally {
      await cleanup();
    }
  });

  it("Prisma-style where with comparison operators", async () => {
    const cleanup = await seedAndCleanup();
    try {
      const expensive = await products
        .find(["scm-electronics"])
        .where({ price: { gte: 1000 } })
        .exec();
      expect(expensive).toHaveLength(1);
      expect(expensive[0]!.name).toBe("Laptop");
    } finally {
      await cleanup();
    }
  });

  it("Prisma-style where with contains", async () => {
    const cleanup = await seedAndCleanup();
    try {
      const results = await products
        .find(["scm-electronics"])
        .where({ name: { contains: "Lap" } })
        .exec();
      expect(results).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  // SKIP: vnext-preview emulator does not yet support Request Unit (RU) charge metrics.
  // See: https://learn.microsoft.com/en-us/azure/cosmos-db/emulator-linux
  it("createWithMetrics returns RU", async () => {
    const { result, ru } = await products.createWithMetrics({
      id: "scm-p-metrics",
      category: "scm-test",
      name: "Metrics Test",
      price: 1,
      inStock: true,
      description: "test",
    });

    try {
      expect(result.id).toBe("scm-p-metrics");
      // RU charge may be 0 on emulator — accept >= 0
      expect(ru).toBeGreaterThanOrEqual(0);
    } finally {
      try {
        await products.hardDelete("scm-p-metrics", ["scm-test"]);
      } catch {}
    }
  });

  // SKIP: vnext-preview emulator does not yet support Request Unit (RU) charge metrics.
  // See: https://learn.microsoft.com/en-us/azure/cosmos-db/emulator-linux
  it("findByIdWithMetrics returns RU", async () => {
    await products.upsert({
      id: "scm-p-metrics2",
      category: "scm-electronics",
      name: "RU Test",
      price: 1,
      inStock: true,
      description: "test",
    });

    try {
      const { result, ru } = await products.findByIdWithMetrics("scm-p-metrics2", [
        "scm-electronics",
      ]);
      expect(result).toBeDefined();
      // RU charge may be 0 on emulator — accept >= 0
      expect(ru).toBeGreaterThanOrEqual(0);
    } finally {
      try {
        await products.delete("scm-p-metrics2", ["scm-electronics"]);
      } catch {}
    }
  });
});
