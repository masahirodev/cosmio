import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { ConflictError, ValidationError } from "../../src/errors/index.js";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { createTestClient, setupTestDatabase, teardownTestDatabase } from "./setup.js";

const TEST_FILE = "crud";

const UserModel = defineModel({
  name: "User",
  container: "test-crud",
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
  const client = createTestClient(TEST_FILE);
  const users = client.model(UserModel);

  beforeAll(async () => {
    await setupTestDatabase(TEST_FILE);
    await ensureContainer(client.database, UserModel);
  }, 60_000);

  afterAll(async () => {
    await teardownTestDatabase(TEST_FILE);
  });

  it("create → findById → delete", async () => {
    const doc = await users.create({
      id: "crud-1",
      tenantId: "t1",
      name: "Alice",
      email: "alice@example.com",
    });

    expect(doc.id).toBe("crud-1");
    expect(doc.name).toBe("Alice");

    const found = await users.findById("crud-1", ["t1"]);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Alice");

    await users.delete("crud-1", ["t1"]);

    const deleted = await users.findById("crud-1", ["t1"]);
    expect(deleted).toBeUndefined();
  });

  it("upsert creates and then updates", async () => {
    await users.upsert({
      id: "crud-2",
      tenantId: "t1",
      name: "Bob",
      email: "bob@example.com",
    });

    const created = await users.findById("crud-2", ["t1"]);
    expect(created!.name).toBe("Bob");

    await users.upsert({
      id: "crud-2",
      tenantId: "t1",
      name: "Bob Updated",
      email: "bob@example.com",
    });

    const updated = await users.findById("crud-2", ["t1"]);
    expect(updated!.name).toBe("Bob Updated");

    try {
      await users.delete("crud-2", ["t1"]);
    } catch {}
  });

  it("replace overwrites the document", async () => {
    await users.create({
      id: "crud-3",
      tenantId: "t1",
      name: "Charlie",
      email: "charlie@example.com",
    });

    await users.replace("crud-3", {
      id: "crud-3",
      tenantId: "t1",
      name: "Charlie Replaced",
      email: "charlie-new@example.com",
    });

    const replaced = await users.findById("crud-3", ["t1"]);
    expect(replaced!.name).toBe("Charlie Replaced");
    expect(replaced!.email).toBe("charlie-new@example.com");

    try {
      await users.delete("crud-3", ["t1"]);
    } catch {}
  });

  it("patch performs partial update", async () => {
    await users.create({
      id: "crud-4",
      tenantId: "t1",
      name: "Dave",
      email: "dave@example.com",
    });

    await users.patch("crud-4", ["t1"], [{ op: "replace", path: "/name", value: "Dave Patched" }]);

    const patched = await users.findById("crud-4", ["t1"]);
    expect(patched!.name).toBe("Dave Patched");
    expect(patched!.email).toBe("dave@example.com"); // unchanged

    try {
      await users.delete("crud-4", ["t1"]);
    } catch {}
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
      id: "crud-dup",
      tenantId: "t1",
      name: "First",
      email: "first@example.com",
    });

    await expect(
      users.create({
        id: "crud-dup",
        tenantId: "t1",
        name: "Second",
        email: "second@example.com",
      }),
    ).rejects.toThrow(ConflictError);

    try {
      await users.delete("crud-dup", ["t1"]);
    } catch {}
  });
});
