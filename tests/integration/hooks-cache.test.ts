import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { withCosmioContext } from "../../src/integrations/azure-functions.js";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { cleanupTestDatabase, createTestClient, ensureTestDatabase } from "./setup.js";

const NoteModel = defineModel({
  name: "Note",
  container: "notes",
  partitionKey: ["/userId"],
  schema: z.object({
    id: z.string(),
    userId: z.string(),
    title: z.string(),
    body: z.string(),
    updatedBy: z.string().optional(),
  }),
  defaults: {
    body: "",
  },
});

describe("Hooks + Cache (integration)", () => {
  const isVnextPreview = process.env.COSMOS_EMULATOR_FLAVOR !== "full";
  const itPatch = isVnextPreview ? it.skip : it;

  const client = createTestClient();
  const notes = client.model(NoteModel);

  beforeAll(async () => {
    await ensureTestDatabase();
    await ensureContainer(client.database, NoteModel);
  }, 60_000);

  afterAll(async () => {
    try {
      await notes.hardDelete("n1", ["u1"]);
      await notes.hardDelete("n2", ["u1"]);
    } catch {
      // ignore
    }
    await cleanupTestDatabase();
  });

  it("beforeCreate hook mutates document before write", async () => {
    notes.use("beforeCreate", (doc) => {
      doc.updatedBy = "hook-system";
    });

    const created = await notes.create({
      id: "n1",
      userId: "u1",
      title: "Test Note",
    });

    expect(created.updatedBy).toBe("hook-system");

    const found = await notes.findById("n1", ["u1"]);
    expect(found!.updatedBy).toBe("hook-system");
  });

  it("defaults auto-fill body field", async () => {
    const created = await notes.create({
      id: "n2",
      userId: "u1",
      title: "No Body",
    });

    expect(created.body).toBe("");
  });

  it("request-scoped cache works via withCosmioContext", async () => {
    await withCosmioContext(async () => {
      // First read
      const note1 = await notes.findById("n1", ["u1"]);
      expect(note1).toBeDefined();

      // Second read — should be cached (can't easily count DB calls here,
      // but we verify the value is the same)
      const note2 = await notes.findById("n1", ["u1"]);
      expect(note2).toBeDefined();
      expect(note2!.id).toBe(note1!.id);
      expect(note2!.title).toBe(note1!.title);
    });
  });

  // SKIP: vnext-preview emulator limitation — patch非サポート
  itPatch("cache invalidation after write", async () => {
    await withCosmioContext(async () => {
      // Read
      const before = await notes.findById("n1", ["u1"]);
      expect(before!.title).toBe("Test Note");

      // Update
      await notes.patch("n1", ["u1"], [{ op: "replace", path: "/title", value: "Updated Title" }]);

      // Read again — should get fresh data (cache invalidated by patch)
      const after = await notes.findById("n1", ["u1"]);
      expect(after!.title).toBe("Updated Title");
    });
  });

  it("query cache within context", async () => {
    await withCosmioContext(async () => {
      const r1 = await notes
        .find(["u1"])
        .where({ title: { contains: "Updated" } })
        .exec();
      const r2 = await notes
        .find(["u1"])
        .where({ title: { contains: "Updated" } })
        .exec();

      // Same results
      expect(r1.length).toBe(r2.length);
      expect(r1.map((r) => r.id).sort()).toEqual(r2.map((r) => r.id).sort());
    });
  });
});
