import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { cleanupTestDatabase, createTestClient, ensureTestDatabase } from "./setup.js";

const InspectionModel = defineModel({
  name: "Inspection",
  container: "inspections",
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
    await ensureTestDatabase();
    await ensureContainer(client.database, InspectionModel);
  }, 60_000);

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  // SKIP: vnext-preview emulator limitation — unknown type of jsonb container
  it.skip("CRUD with hierarchical PK [tenantId, siteId]", async () => {
    await inspections.create({
      id: "insp-1",
      tenantId: "t1",
      siteId: "s1",
      name: "定期点検",
    });

    const found = await inspections.findById("insp-1", ["t1", "s1"]);
    expect(found).toBeDefined();
    expect(found!.name).toBe("定期点検");

    await inspections.delete("insp-1", ["t1", "s1"]);

    const deleted = await inspections.findById("insp-1", ["t1", "s1"]);
    expect(deleted).toBeUndefined();
  });

  // SKIP: vnext-preview emulator limitation — unknown type of jsonb container
  it.skip("query scoped to hierarchical PK", async () => {
    await inspections.upsert({ id: "insp-a", tenantId: "t1", siteId: "s1", name: "A" });
    await inspections.upsert({ id: "insp-b", tenantId: "t1", siteId: "s1", name: "B" });
    await inspections.upsert({ id: "insp-c", tenantId: "t1", siteId: "s2", name: "C" });

    const results = await inspections.find(["t1", "s1"]).exec();
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id).sort()).toEqual(["insp-a", "insp-b"]);

    // Cleanup
    await inspections.delete("insp-a", ["t1", "s1"]);
    await inspections.delete("insp-b", ["t1", "s1"]);
    await inspections.delete("insp-c", ["t1", "s2"]);
  });
});
