import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { cleanupTestDatabase, createTestClient, ensureTestDatabase } from "./setup.js";

const ItemModel = defineModel({
  name: "Item",
  container: "items",
  partitionKey: ["/category"],
  schema: z.object({
    id: z.string(),
    category: z.string(),
    name: z.string(),
  }),
});

describe("Bulk operations", () => {
  const client = createTestClient();
  const items = client.model(ItemModel);

  beforeAll(async () => {
    await ensureTestDatabase();
    await ensureContainer(client.database, ItemModel);
  }, 60_000);

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  it("bulk create multiple items", async () => {
    await items.bulk([
      { type: "create", body: { id: "i1", category: "electronics", name: "Phone" } },
      { type: "create", body: { id: "i2", category: "electronics", name: "Laptop" } },
      { type: "create", body: { id: "i3", category: "books", name: "Novel" } },
    ]);

    const phone = await items.findById("i1", ["electronics"]);
    expect(phone).toBeDefined();
    expect(phone!.name).toBe("Phone");

    const novel = await items.findById("i3", ["books"]);
    expect(novel).toBeDefined();
    expect(novel!.name).toBe("Novel");
  });

  it("bulk upsert updates existing items", async () => {
    await items.bulk([
      { type: "upsert", body: { id: "i1", category: "electronics", name: "Phone Pro" } },
    ]);

    const updated = await items.findById("i1", ["electronics"]);
    expect(updated!.name).toBe("Phone Pro");
  });

  it("bulk delete removes items", async () => {
    await items.bulk([
      { type: "delete", id: "i1", partitionKeyValues: ["electronics"] },
      { type: "delete", id: "i2", partitionKeyValues: ["electronics"] },
      { type: "delete", id: "i3", partitionKeyValues: ["books"] },
    ]);

    const deleted = await items.findById("i1", ["electronics"]);
    expect(deleted).toBeUndefined();
  });
});
