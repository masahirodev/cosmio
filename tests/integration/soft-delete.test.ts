import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { cleanupTestDatabase, createTestClient, ensureTestDatabase } from "./setup.js";

const SoftModel = defineModel({
  name: "SoftDoc",
  container: "soft-docs",
  partitionKey: ["/tenantId"],
  softDelete: { field: "deletedAt" },
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    name: z.string(),
    deletedAt: z.number().optional(),
  }),
});

describe("Soft Delete (integration)", () => {
  const client = createTestClient();
  const docs = client.model(SoftModel);

  beforeAll(async () => {
    await ensureTestDatabase();
    await ensureContainer(client.database, SoftModel);
  }, 60_000);

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  // SKIP: vnext-preview emulator limitation — patch非サポート
  it.skip("soft delete sets deletedAt, findById returns undefined", async () => {
    await docs.create({ id: "sd-1", tenantId: "t1", name: "Test" });

    await docs.delete("sd-1", ["t1"]);

    const found = await docs.findById("sd-1", ["t1"]);
    expect(found).toBeUndefined();
  });

  // SKIP: vnext-preview emulator limitation — patch非サポート（依存）
  it.skip("findWithDeleted returns soft-deleted docs", async () => {
    const results = await docs.findWithDeleted(["t1"]).exec();
    const deleted = results.find((r) => r.id === "sd-1");
    expect(deleted).toBeDefined();
    expect(deleted!.deletedAt).toBeDefined();
  });

  // SKIP: vnext-preview emulator limitation — patch非サポート
  it.skip("restore brings back soft-deleted doc", async () => {
    const restored = await docs.restore("sd-1", ["t1"]);
    expect(restored).toBeDefined();

    const found = await docs.findById("sd-1", ["t1"]);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Test");
  });

  // SKIP: vnext-preview emulator limitation — unknown type of jsonb container
  it.skip("hardDelete physically removes", async () => {
    await docs.hardDelete("sd-1", ["t1"]);

    const results = await docs.findWithDeleted(["t1"]).exec();
    expect(results.find((r) => r.id === "sd-1")).toBeUndefined();
  });
});
