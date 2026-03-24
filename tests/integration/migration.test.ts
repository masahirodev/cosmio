import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { CosmioClient } from "../../src/client/cosmio-client.js";
import { MigrationRegistry } from "../../src/migration/migration-registry.js";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import {
  cleanupTestDatabase,
  EMULATOR_ENDPOINT,
  EMULATOR_KEY,
  ensureTestDatabase,
  TEST_DATABASE,
} from "./setup.js";

// v1 schema: firstName + lastName
const UserModelV1Schema = z.object({
  id: z.string(),
  tenantId: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  fullName: z.string().optional(),
  role: z.string().optional(),
});

const UserModel = defineModel({
  name: "User",
  container: "migration-users",
  partitionKey: ["/tenantId"],
  schema: UserModelV1Schema,
});

describe("Migration (integration)", () => {
  // Create client WITHOUT migrations first to seed v1 data
  const seedClient = new CosmioClient(
    { cosmos: { endpoint: EMULATOR_ENDPOINT, key: EMULATOR_KEY }, database: TEST_DATABASE },
    { singleton: false },
  );

  beforeAll(async () => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    await ensureTestDatabase();
    await ensureContainer(seedClient.database, UserModel);

    // Seed v1 documents (no _v field, old schema)
    const users = seedClient.model(UserModel);
    await users.upsert({ id: "u1", tenantId: "t1", firstName: "Taro", lastName: "Yamada" });
    await users.upsert({ id: "u2", tenantId: "t1", firstName: "Hanako", lastName: "Sato" });
    await users.upsert({
      id: "u3",
      tenantId: "t1",
      fullName: "Already Migrated",
      role: "admin",
    });
  }, 60_000);

  afterAll(async () => {
    await cleanupTestDatabase();
    CosmioClient.resetInstances();
  });

  // SKIP: vnext-preview emulator limitation — unknown type of jsonb container for raw item insert
  it.skip("reads v1 documents and auto-migrates on read", async () => {
    // Set up migrations
    const migrations = new MigrationRegistry({ versionField: "_v" });

    migrations.register({
      name: "v2-merge-name",
      version: 2,
      up: (doc) => {
        if (doc.firstName && !doc.fullName) {
          doc.fullName = `${doc.firstName} ${doc.lastName}`;
          delete doc.firstName;
          delete doc.lastName;
        }
        return doc;
      },
    });

    migrations.register({
      name: "v3-default-role",
      version: 3,
      scope: { models: ["User"] },
      up: (doc) => {
        if (!doc.role) doc.role = "member";
        return doc;
      },
    });

    // Create client WITH migrations
    const client = new CosmioClient(
      {
        cosmos: { endpoint: EMULATOR_ENDPOINT, key: EMULATOR_KEY },
        database: TEST_DATABASE,
        migrations,
      },
      { singleton: false },
    );
    const users = client.model(UserModel);

    // Read v1 document — should be auto-migrated
    const taro = await users.findById("u1", ["t1"]);
    expect(taro).toBeDefined();
    expect(taro!.fullName).toBe("Taro Yamada");
    expect(taro!.role).toBe("member");
    expect((taro as Record<string, unknown>).firstName).toBeUndefined();

    // Already migrated document should be untouched
    const migrated = await users.findById("u3", ["t1"]);
    expect(migrated!.fullName).toBe("Already Migrated");
    expect(migrated!.role).toBe("admin");
  });

  it("query results are also migrated", async () => {
    const migrations = new MigrationRegistry({ versionField: "_v" });
    migrations.register({
      name: "v2-merge-name",
      version: 2,
      up: (doc) => {
        if (doc.firstName && !doc.fullName) {
          doc.fullName = `${doc.firstName} ${doc.lastName}`;
          delete doc.firstName;
          delete doc.lastName;
        }
        return doc;
      },
    });

    const client = new CosmioClient(
      {
        cosmos: { endpoint: EMULATOR_ENDPOINT, key: EMULATOR_KEY },
        database: TEST_DATABASE,
        migrations,
      },
      { singleton: false },
    );
    const users = client.model(UserModel);

    const allUsers = await users.find(["t1"]).exec();
    expect(allUsers.length).toBeGreaterThanOrEqual(3);

    // All users should have fullName after migration
    for (const user of allUsers) {
      expect(user.fullName).toBeDefined();
    }
  });
});
