import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { cleanupTestDatabase, createTestClient, ensureTestDatabase } from "./setup.js";

const ProductModel = defineModel({
  name: "Product",
  container: "products",
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
  const isVnextPreview = process.env.COSMOS_EMULATOR_FLAVOR !== "full";
  const itQuery = isVnextPreview ? it.skip : it;

  const client = createTestClient();
  const products = client.model(ProductModel);

  beforeAll(async () => {
    await ensureTestDatabase();
    await ensureContainer(client.database, ProductModel);

    await products.upsert({
      id: "p1",
      category: "electronics",
      name: "Phone",
      price: 999,
      inStock: true,
      description: "A smartphone",
    });
    await products.upsert({
      id: "p2",
      category: "electronics",
      name: "Laptop",
      price: 1999,
      inStock: true,
      description: "A laptop",
    });
    await products.upsert({
      id: "p3",
      category: "electronics",
      name: "Tablet",
      price: 499,
      inStock: false,
      description: "A tablet",
    });
  }, 60_000);

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  it("select returns only requested fields", async () => {
    const results = await products.find(["electronics"]).select("id", "name", "price").exec();

    expect(results.length).toBeGreaterThanOrEqual(3);
    // Should have selected fields
    expect(results[0]).toHaveProperty("id");
    expect(results[0]).toHaveProperty("name");
    expect(results[0]).toHaveProperty("price");
  });

  // SKIP: vnext-preview emulator limitation — unknown type of jsonb container
  itQuery("count returns total without fetching documents", async () => {
    const total = await products.find(["electronics"]).count();
    expect(total).toBeGreaterThanOrEqual(3);
  });

  // SKIP: vnext-preview emulator limitation — unknown type of jsonb container
  itQuery("count with where filter", async () => {
    const inStockCount = await products.find(["electronics"]).where({ inStock: true }).count();
    expect(inStockCount).toBe(2);
  });

  it("Prisma-style where with comparison operators", async () => {
    const expensive = await products
      .find(["electronics"])
      .where({ price: { gte: 1000 } })
      .exec();
    expect(expensive).toHaveLength(1);
    expect(expensive[0]!.name).toBe("Laptop");
  });

  it("Prisma-style where with contains", async () => {
    const results = await products
      .find(["electronics"])
      .where({ name: { contains: "Lap" } })
      .exec();
    expect(results).toHaveLength(1);
  });

  // SKIP: vnext-preview emulator limitation — unknown type of jsonb container
  itQuery("createWithMetrics returns RU", async () => {
    const { result, ru } = await products.createWithMetrics({
      id: "p-metrics",
      category: "test",
      name: "Metrics Test",
      price: 1,
      inStock: true,
      description: "test",
    });

    expect(result.id).toBe("p-metrics");
    expect(ru).toBeGreaterThan(0);

    // Clean up
    await products.hardDelete("p-metrics", ["test"]);
  });

  // SKIP: vnext-preview emulator limitation — unknown type of jsonb container
  itQuery("findByIdWithMetrics returns RU", async () => {
    const { result, ru } = await products.findByIdWithMetrics("p1", ["electronics"]);
    expect(result).toBeDefined();
    expect(ru).toBeGreaterThan(0);
  });
});
