import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { createTestClient } from "./setup.js";

const InspectionModel = defineModel({
  name: "Inspection",
  container: "test-hierarchical-pk",
  partitionKey: ["/tenantId", "/siteId"],
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    siteId: z.string(),
    name: z.string(),
  }),
});

describe("Hierarchical partition key", () => {
  const client = createTestClient();
  const inspections = client.model(InspectionModel);

  beforeAll(async () => {
    await ensureContainer(client.database, InspectionModel);
  }, 60_000);

  it("CRUD with hierarchical PK [tenantId, siteId]", async () => {
    await inspections.create({
      id: "hpk-1",
      tenantId: "t1",
      siteId: "s1",
      name: "定期点検",
    });

    const found = await inspections.findById("hpk-1", ["t1", "s1"]);
    expect(found).toBeDefined();
    expect(found!.name).toBe("定期点検");

    await inspections.delete("hpk-1", ["t1", "s1"]);

    const deleted = await inspections.findById("hpk-1", ["t1", "s1"]);
    expect(deleted).toBeUndefined();
  });

  it("query scoped to hierarchical PK", async () => {
    await inspections.upsert({ id: "hpk-a", tenantId: "t1", siteId: "s1", name: "A" });
    await inspections.upsert({ id: "hpk-b", tenantId: "t1", siteId: "s1", name: "B" });
    await inspections.upsert({ id: "hpk-c", tenantId: "t1", siteId: "s2", name: "C" });

    try {
      const results = await inspections.find(["t1", "s1"]).exec();
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id).sort()).toEqual(["hpk-a", "hpk-b"]);
    } finally {
      try {
        await inspections.delete("hpk-a", ["t1", "s1"]);
      } catch {}
      try {
        await inspections.delete("hpk-b", ["t1", "s1"]);
      } catch {}
      try {
        await inspections.delete("hpk-c", ["t1", "s2"]);
      } catch {}
    }
  });
});
