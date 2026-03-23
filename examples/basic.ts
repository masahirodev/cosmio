/**
 * Basic example: Define models and perform CRUD operations.
 *
 * Run with: npx tsx examples/basic.ts
 * (Requires a running Cosmos DB emulator or real endpoint)
 */
import { z } from "zod";
import { CosmioClient, defineModel, ensureContainer } from "../src/index.js";

// 1. Define a model
const UserModel = defineModel({
  name: "User",
  container: "users",
  partitionKey: ["/tenantId"],
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    name: z.string(),
    email: z.string().email(),
    role: z.string(),
    createdAt: z.number(),
  }),
  defaults: {
    role: "member",
    createdAt: () => Math.floor(Date.now() / 1000),
  },
  defaultTtl: -1, // Enable per-document TTL
  description: "Application users",
});

// 2. Connect
const client = new CosmioClient({
  cosmos: { endpoint: "https://localhost:8081", key: "your-key" },
  database: "example-db",
});

async function main() {
  // 3. Ensure container exists
  await ensureContainer(client.database, UserModel);

  const users = client.model(UserModel);

  // 4. Create — role and createdAt are auto-filled by defaults
  const user = await users.create({
    id: "user-1",
    tenantId: "acme",
    name: "Alice",
    email: "alice@acme.com",
  });
  console.log("Created:", user);

  // 5. Read
  const found = await users.findById("user-1", ["acme"]);
  console.log("Found:", found);

  // 6. Query with builder
  const results = await users
    .find(["acme"])
    .where("role", "=", "member")
    .orderBy("createdAt", "DESC")
    .limit(10)
    .exec();
  console.log("Query results:", results.length);

  // 7. Patch
  await users.patch("user-1", ["acme"], [{ op: "replace", path: "/name", value: "Alice Smith" }]);

  // 8. Delete
  await users.delete("user-1", ["acme"]);
  console.log("Done!");
}

main().catch(console.error);
