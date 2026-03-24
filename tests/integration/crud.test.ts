import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { ConflictError, ValidationError } from "../../src/errors/index.js";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { cleanupTestDatabase, createTestClient, ensureTestDatabase } from "./setup.js";

const UserModel = defineModel({
  name: "User",
  container: "users",
  partitionKey: ["/tenantId"],
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    name: z.string(),
    email: z.string().email(),
    age: z.number().optional(),
  }),
});

describe("CRUD operations", () => {
  const isVnextPreview = process.env.COSMOS_EMULATOR_FLAVOR !== "full";
  const itPatch = isVnextPreview ? it.skip : it;

  const client = createTestClient();
  const users = client.model(UserModel);

  beforeAll(async () => {
    await ensureTestDatabase();
    await ensureContainer(client.database, UserModel);
  }, 60_000);

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  it("create → findById → delete", async () => {
    const doc = await users.create({
      id: "user-1",
      tenantId: "t1",
      name: "Alice",
      email: "alice@example.com",
    });

    expect(doc.id).toBe("user-1");
    expect(doc.name).toBe("Alice");

    const found = await users.findById("user-1", ["t1"]);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Alice");

    await users.delete("user-1", ["t1"]);

    const deleted = await users.findById("user-1", ["t1"]);
    expect(deleted).toBeUndefined();
  });

  it("upsert creates and then updates", async () => {
    await users.upsert({
      id: "user-2",
      tenantId: "t1",
      name: "Bob",
      email: "bob@example.com",
    });

    const created = await users.findById("user-2", ["t1"]);
    expect(created!.name).toBe("Bob");

    await users.upsert({
      id: "user-2",
      tenantId: "t1",
      name: "Bob Updated",
      email: "bob@example.com",
    });

    const updated = await users.findById("user-2", ["t1"]);
    expect(updated!.name).toBe("Bob Updated");

    await users.delete("user-2", ["t1"]);
  });

  it("replace overwrites the document", async () => {
    await users.create({
      id: "user-3",
      tenantId: "t1",
      name: "Charlie",
      email: "charlie@example.com",
    });

    await users.replace("user-3", {
      id: "user-3",
      tenantId: "t1",
      name: "Charlie Replaced",
      email: "charlie-new@example.com",
    });

    const replaced = await users.findById("user-3", ["t1"]);
    expect(replaced!.name).toBe("Charlie Replaced");
    expect(replaced!.email).toBe("charlie-new@example.com");

    await users.delete("user-3", ["t1"]);
  });

  // SKIP: vnext-preview emulator limitation — patch非サポート
  itPatch("patch performs partial update", async () => {
    await users.create({
      id: "user-4",
      tenantId: "t1",
      name: "Dave",
      email: "dave@example.com",
    });

    await users.patch("user-4", ["t1"], [{ op: "replace", path: "/name", value: "Dave Patched" }]);

    const patched = await users.findById("user-4", ["t1"]);
    expect(patched!.name).toBe("Dave Patched");
    expect(patched!.email).toBe("dave@example.com"); // unchanged

    await users.delete("user-4", ["t1"]);
  });

  it("create rejects invalid data with ValidationError", async () => {
    await expect(
      users.create({
        id: "bad",
        tenantId: "t1",
        name: "Bad",
        email: "not-an-email",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("create duplicate id throws ConflictError", async () => {
    await users.create({
      id: "user-dup",
      tenantId: "t1",
      name: "First",
      email: "first@example.com",
    });

    await expect(
      users.create({
        id: "user-dup",
        tenantId: "t1",
        name: "Second",
        email: "second@example.com",
      }),
    ).rejects.toThrow(ConflictError);

    await users.delete("user-dup", ["t1"]);
  });
});
