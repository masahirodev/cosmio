import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { createTestClient } from "./setup.js";

const SoftModel = defineModel({
  name: "SoftDoc",
  container: "test-soft-delete",
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
    await ensureContainer(client.database, SoftModel);
  }, 60_000);

  it("soft delete sets deletedAt, findById returns undefined", async () => {
    await docs.create({ id: "sd-1", tenantId: "t1", name: "Test" });

    await docs.delete("sd-1", ["t1"]);

    const found = await docs.findById("sd-1", ["t1"]);
    expect(found).toBeUndefined();

    // Cleanup
    try {
      await docs.hardDelete("sd-1", ["t1"]);
    } catch {}
  });

  it("findWithDeleted returns soft-deleted docs", async () => {
    await docs.create({ id: "sd-2", tenantId: "t1", name: "Test2" });
    await docs.delete("sd-2", ["t1"]);

    const results = await docs.findWithDeleted(["t1"]).exec();
    const deleted = results.find((r) => r.id === "sd-2");
    expect(deleted).toBeDefined();
    expect(deleted!.deletedAt).toBeDefined();

    // Cleanup
    try {
      await docs.hardDelete("sd-2", ["t1"]);
    } catch {}
  });

  it("restore brings back soft-deleted doc", async () => {
    await docs.create({ id: "sd-3", tenantId: "t1", name: "Test3" });
    await docs.delete("sd-3", ["t1"]);

    const restored = await docs.restore("sd-3", ["t1"]);
    expect(restored).toBeDefined();

    const found = await docs.findById("sd-3", ["t1"]);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Test3");

    // Cleanup
    try {
      await docs.hardDelete("sd-3", ["t1"]);
    } catch {}
  });

  it("hardDelete physically removes", async () => {
    await docs.create({ id: "sd-4", tenantId: "t1", name: "Test4" });

    await docs.hardDelete("sd-4", ["t1"]);

    const results = await docs.findWithDeleted(["t1"]).exec();
    expect(results.find((r) => r.id === "sd-4")).toBeUndefined();
  });
});
