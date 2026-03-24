import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { withCosmioContext } from "../../src/integrations/azure-functions.js";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { createTestClient, setupTestDatabase, teardownTestDatabase } from "./setup.js";

const TEST_FILE = "hooks-cache";

const NoteModel = defineModel({
  name: "Note",
  container: "test-hooks-cache",
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
  const client = createTestClient(TEST_FILE);
  const notes = client.model(NoteModel);

  beforeAll(async () => {
    await setupTestDatabase(TEST_FILE);
    await ensureContainer(client.database, NoteModel);
  }, 60_000);

  afterAll(async () => {
    await teardownTestDatabase(TEST_FILE);
  });

  it("beforeCreate hook mutates document before write", async () => {
    notes.use("beforeCreate", (doc) => {
      doc.updatedBy = "hook-system";
    });

    const created = await notes.create({
      id: "hc-n1",
      userId: "u1",
      title: "Test Note",
    });

    expect(created.updatedBy).toBe("hook-system");

    const found = await notes.findById("hc-n1", ["u1"]);
    expect(found!.updatedBy).toBe("hook-system");

    try {
      await notes.delete("hc-n1", ["u1"]);
    } catch {}
  });

  it("defaults auto-fill body field", async () => {
    const created = await notes.create({
      id: "hc-n2",
      userId: "u1",
      title: "No Body",
    });

    expect(created.body).toBe("");

    try {
      await notes.delete("hc-n2", ["u1"]);
    } catch {}
  });

  it("request-scoped cache works via withCosmioContext", async () => {
    await notes.create({ id: "hc-n3", userId: "u1", title: "Cache Test" });

    try {
      await withCosmioContext(async () => {
        const note1 = await notes.findById("hc-n3", ["u1"]);
        expect(note1).toBeDefined();

        const note2 = await notes.findById("hc-n3", ["u1"]);
        expect(note2).toBeDefined();
        expect(note2!.id).toBe(note1!.id);
        expect(note2!.title).toBe(note1!.title);
      });
    } finally {
      try {
        await notes.delete("hc-n3", ["u1"]);
      } catch {}
    }
  });

  it("cache invalidation after write", async () => {
    await notes.create({ id: "hc-n4", userId: "u1", title: "Before Patch" });

    try {
      await withCosmioContext(async () => {
        const before = await notes.findById("hc-n4", ["u1"]);
        expect(before!.title).toBe("Before Patch");

        await notes.patch(
          "hc-n4",
          ["u1"],
          [{ op: "replace", path: "/title", value: "After Patch" }],
        );

        const after = await notes.findById("hc-n4", ["u1"]);
        expect(after!.title).toBe("After Patch");
      });
    } finally {
      try {
        await notes.delete("hc-n4", ["u1"]);
      } catch {}
    }
  });

  it("query cache within context", async () => {
    await notes.create({ id: "hc-n5", userId: "u1", title: "QueryCache Test" });

    try {
      await withCosmioContext(async () => {
        const r1 = await notes
          .find(["u1"])
          .where({ title: { contains: "QueryCache" } })
          .exec();
        const r2 = await notes
          .find(["u1"])
          .where({ title: { contains: "QueryCache" } })
          .exec();

        expect(r1.length).toBe(r2.length);
        expect(r1.map((r) => r.id).sort()).toEqual(r2.map((r) => r.id).sort());
      });
    } finally {
      try {
        await notes.delete("hc-n5", ["u1"]);
      } catch {}
    }
  });
});
