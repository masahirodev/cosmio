import { CosmosClient } from "@azure/cosmos";

const EMULATOR_ENDPOINT = "https://localhost:8081";
const EMULATOR_KEY =
  "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";

const endpoint = process.env.COSMOS_TEST_ENDPOINT ?? EMULATOR_ENDPOINT;
const key = process.env.COSMOS_TEST_KEY ?? EMULATOR_KEY;
const database = process.env.COSMOS_TEST_DATABASE ?? "cosmio-test";

/**
 * vitest globalSetup: runs once before all test files, returns teardown function.
 */
export default async function setup(): Promise<() => Promise<void>> {
  if (!process.env.COSMOS_TEST_ENDPOINT) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  // Ensure DB exists
  const client = new CosmosClient({ endpoint, key });
  await client.databases.createIfNotExists({ id: database });

  // Return teardown: delete DB after all tests
  return async () => {
    try {
      await client.database(database).delete();
    } catch {
      // ignore
    }
  };
}
