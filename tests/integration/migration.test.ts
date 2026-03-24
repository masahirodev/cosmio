import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { CosmioClient } from "../../src/client/cosmio-client.js";
import { MigrationRegistry } from "../../src/migration/migration-registry.js";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { TEST_DATABASE, TEST_ENDPOINT, TEST_KEY } from "./setup.js";

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
  container: "test-migration",
  partitionKey: ["/tenantId"],
  schema: UserModelV1Schema,
});

describe("Migration (integration)", () => {
  // Create client WITHOUT migrations first to seed v1 data
  const seedClient = new CosmioClient(
    { cosmos: { endpoint: TEST_ENDPOINT, key: TEST_KEY }, database: TEST_DATABASE },
    { singleton: false },
  );

  beforeAll(async () => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    await ensureContainer(seedClient.database, UserModel);
  }, 60_000);

  afterAll(async () => {
    CosmioClient.resetInstances();
  });

  it("reads v1 documents and auto-migrates on read", async () => {
    // Setup: seed v1 documents
    const seedUsers = seedClient.model(UserModel);
    await seedUsers.upsert({
      id: "mig-u1",
      tenantId: "mig-t1",
      firstName: "Taro",
      lastName: "Yamada",
    });
    await seedUsers.upsert({
      id: "mig-u3",
      tenantId: "mig-t1",
      fullName: "Already Migrated",
      role: "admin",
    });

    try {
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
          cosmos: { endpoint: TEST_ENDPOINT, key: TEST_KEY },
          database: TEST_DATABASE,
          migrations,
        },
        { singleton: false },
      );
      const users = client.model(UserModel);

      // Read v1 document — should be auto-migrated
      const taro = await users.findById("mig-u1", ["mig-t1"]);
      expect(taro).toBeDefined();
      expect(taro!.fullName).toBe("Taro Yamada");
      expect(taro!.role).toBe("member");
      expect((taro as Record<string, unknown>).firstName).toBeUndefined();

      // Already migrated document should be untouched
      const migrated = await users.findById("mig-u3", ["mig-t1"]);
      expect(migrated!.fullName).toBe("Already Migrated");
      expect(migrated!.role).toBe("admin");
    } finally {
      try {
        await seedClient.model(UserModel).delete("mig-u1", ["mig-t1"]);
      } catch {}
      try {
        await seedClient.model(UserModel).delete("mig-u3", ["mig-t1"]);
      } catch {}
    }
  });

  it("query results are also migrated", async () => {
    // Setup: seed documents for this test
    const seedUsers = seedClient.model(UserModel);
    await seedUsers.upsert({
      id: "mig-q1",
      tenantId: "mig-t2",
      firstName: "Taro",
      lastName: "Yamada",
    });
    await seedUsers.upsert({
      id: "mig-q2",
      tenantId: "mig-t2",
      firstName: "Hanako",
      lastName: "Sato",
    });
    await seedUsers.upsert({
      id: "mig-q3",
      tenantId: "mig-t2",
      fullName: "Already Migrated",
      role: "admin",
    });

    try {
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
          cosmos: { endpoint: TEST_ENDPOINT, key: TEST_KEY },
          database: TEST_DATABASE,
          migrations,
        },
        { singleton: false },
      );
      const users = client.model(UserModel);

      const allUsers = await users.find(["mig-t2"]).exec();
      expect(allUsers.length).toBeGreaterThanOrEqual(3);

      // All users should have fullName after migration
      for (const user of allUsers) {
        expect(user.fullName).toBeDefined();
      }
    } finally {
      try {
        await seedClient.model(UserModel).delete("mig-q1", ["mig-t2"]);
      } catch {}
      try {
        await seedClient.model(UserModel).delete("mig-q2", ["mig-t2"]);
      } catch {}
      try {
        await seedClient.model(UserModel).delete("mig-q3", ["mig-t2"]);
      } catch {}
    }
  });
});
