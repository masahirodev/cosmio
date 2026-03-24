import { CosmosClient } from "@azure/cosmos";
import { CosmioClient } from "../../src/client/cosmio-client.js";

/**
 * Cosmos DB Emulator default connection settings.
 * The vnext-preview emulator uses a well-known key.
 */
export const EMULATOR_ENDPOINT = "https://localhost:8081";
export const EMULATOR_KEY =
  "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";
export const TEST_DATABASE = "cosmio-test";

/**
 * Create a CosmosClient configured for the local emulator.
 * Disables TLS verification since the emulator uses a self-signed cert.
 */
export function createEmulatorCosmosClient(): CosmosClient {
  // Disable TLS check for emulator's self-signed cert
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  return new CosmosClient({
    endpoint: EMULATOR_ENDPOINT,
    key: EMULATOR_KEY,
  });
}

/**
 * Create a CosmioClient configured for the local emulator.
 */
export function createTestClient(): CosmioClient {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  return new CosmioClient(
    { cosmos: { endpoint: EMULATOR_ENDPOINT, key: EMULATOR_KEY }, database: TEST_DATABASE },
    { singleton: false },
  );
}

/**
 * Ensure a clean test database exists.
 * Deletes any existing DB first to avoid stale data between test files.
 */
export async function ensureTestDatabase(): Promise<void> {
  const cosmos = createEmulatorCosmosClient();
  try {
    await cosmos.database(TEST_DATABASE).delete();
  } catch {
    // ignore
  }
  // vnext-preview emulator needs time to finalize deletion
  await new Promise((r) => setTimeout(r, 1000));
  await cosmos.databases.createIfNotExists({ id: TEST_DATABASE });
}

/**
 * Clean up: delete the test database.
 */
export async function cleanupTestDatabase(): Promise<void> {
  const cosmos = createEmulatorCosmosClient();
  try {
    await cosmos.database(TEST_DATABASE).delete();
  } catch {
    // ignore if not exists
  }
}
