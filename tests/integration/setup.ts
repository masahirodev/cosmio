import { CosmosClient } from "@azure/cosmos";
import { CosmioClient } from "../../src/client/cosmio-client.js";

/**
 * Integration test connection settings.
 *
 * 1. **Emulator** (default): `docker compose up -d`
 * 2. **Real Cosmos DB**: Set COSMOS_TEST_ENDPOINT + COSMOS_TEST_KEY
 */

const EMULATOR_ENDPOINT = "https://localhost:8081";
const EMULATOR_KEY =
  "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";

export const TEST_ENDPOINT = process.env.COSMOS_TEST_ENDPOINT ?? EMULATOR_ENDPOINT;
export const TEST_KEY = process.env.COSMOS_TEST_KEY ?? EMULATOR_KEY;

// Disable TLS verification for emulator's self-signed certificate
if (!process.env.COSMOS_TEST_ENDPOINT) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const DB_PREFIX = process.env.COSMOS_TEST_DATABASE ?? "cosmio-test";

/**
 * Get a unique database name for a test file.
 * Each file gets its own DB to avoid cross-file interference.
 */
export function testDatabaseName(testFileName: string): string {
  return `${DB_PREFIX}-${testFileName}`;
}

/**
 * Create a raw CosmosClient for test setup/teardown.
 */
export function createCosmosClient(): CosmosClient {
  return new CosmosClient({ endpoint: TEST_ENDPOINT, key: TEST_KEY });
}

/**
 * Create a CosmioClient for a specific test file.
 * Each file uses its own database.
 */
export function createTestClient(testFileName: string): CosmioClient {
  return new CosmioClient(
    {
      cosmos: { endpoint: TEST_ENDPOINT, key: TEST_KEY },
      database: testDatabaseName(testFileName),
    },
    { singleton: false },
  );
}

/**
 * Setup: create the database for this test file.
 */
export async function setupTestDatabase(testFileName: string): Promise<void> {
  const cosmos = createCosmosClient();
  await cosmos.databases.createIfNotExists({ id: testDatabaseName(testFileName) });
}

/**
 * Teardown: delete the database for this test file.
 */
export async function teardownTestDatabase(testFileName: string): Promise<void> {
  const cosmos = createCosmosClient();
  try {
    await cosmos.database(testDatabaseName(testFileName)).delete();
  } catch {
    // ignore
  }
}
