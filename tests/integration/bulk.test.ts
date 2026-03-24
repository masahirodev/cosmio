import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { createTestClient } from "./setup.js";

const ItemModel = defineModel({
  name: "Item",
  container: "test-bulk",
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
    await ensureContainer(client.database, ItemModel);
  }, 60_000);

  it("bulk create multiple items", async () => {
    await items.bulk([
      { type: "create", body: { id: "bc-1", category: "electronics", name: "Phone" } },
      { type: "create", body: { id: "bc-2", category: "electronics", name: "Laptop" } },
      { type: "create", body: { id: "bc-3", category: "books", name: "Novel" } },
    ]);

    const phone = await items.findById("bc-1", ["electronics"]);
    expect(phone).toBeDefined();
    expect(phone!.name).toBe("Phone");

    const novel = await items.findById("bc-3", ["books"]);
    expect(novel).toBeDefined();
    expect(novel!.name).toBe("Novel");

    // Cleanup
    try {
      await items.bulk([
        { type: "delete", id: "bc-1", partitionKeyValues: ["electronics"] },
        { type: "delete", id: "bc-2", partitionKeyValues: ["electronics"] },
        { type: "delete", id: "bc-3", partitionKeyValues: ["books"] },
      ]);
    } catch {}
  });

  it("bulk upsert updates existing items", async () => {
    // Setup: create item first
    await items.bulk([
      { type: "create", body: { id: "bu-1", category: "electronics", name: "Phone" } },
    ]);

    await items.bulk([
      { type: "upsert", body: { id: "bu-1", category: "electronics", name: "Phone Pro" } },
    ]);

    const updated = await items.findById("bu-1", ["electronics"]);
    expect(updated!.name).toBe("Phone Pro");

    // Cleanup
    try {
      await items.bulk([{ type: "delete", id: "bu-1", partitionKeyValues: ["electronics"] }]);
    } catch {}
  });

  it("bulk delete removes items", async () => {
    // Setup: create items first
    await items.bulk([
      { type: "create", body: { id: "bd-1", category: "electronics", name: "Phone" } },
      { type: "create", body: { id: "bd-2", category: "electronics", name: "Laptop" } },
      { type: "create", body: { id: "bd-3", category: "books", name: "Novel" } },
    ]);

    await items.bulk([
      { type: "delete", id: "bd-1", partitionKeyValues: ["electronics"] },
      { type: "delete", id: "bd-2", partitionKeyValues: ["electronics"] },
      { type: "delete", id: "bd-3", partitionKeyValues: ["books"] },
    ]);

    const deleted = await items.findById("bd-1", ["electronics"]);
    expect(deleted).toBeUndefined();
  });
});
