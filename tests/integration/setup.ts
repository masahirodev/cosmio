import { basename } from "node:path";
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
export const TEST_DATABASE = process.env.COSMOS_TEST_DATABASE ?? "cosmio-test";
export const IS_EMULATOR = !process.env.COSMOS_TEST_ENDPOINT;

/**
 * Derive a unique container name from the test file path.
 * e.g., "crud.test.ts" → "test-crud"
 */
export function containerName(testFile: string): string {
  return `test-${basename(testFile, ".test.ts")}`;
}

/**
 * Create a CosmosClient for integration tests.
 */
export function createEmulatorCosmosClient(): CosmosClient {
  if (IS_EMULATOR) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  return new CosmosClient({ endpoint: TEST_ENDPOINT, key: TEST_KEY });
}

/**
 * Create a CosmioClient for integration tests.
 */
export function createTestClient(): CosmioClient {
  if (IS_EMULATOR) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  return new CosmioClient(
    { cosmos: { endpoint: TEST_ENDPOINT, key: TEST_KEY }, database: TEST_DATABASE },
    { singleton: false },
  );
}

/**
 * Ensure the test database exists (does NOT delete).
 */
export async function ensureTestDatabase(): Promise<void> {
  const cosmos = createEmulatorCosmosClient();
  await cosmos.databases.createIfNotExists({ id: TEST_DATABASE });
}

/**
 * Delete the test database. Called from globalTeardown.
 */
export async function cleanupTestDatabase(): Promise<void> {
  const cosmos = createEmulatorCosmosClient();
  try {
    await cosmos.database(TEST_DATABASE).delete();
  } catch {
    // ignore
  }
}
