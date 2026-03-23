/**
 * Connect to Cosmos DB and sample documents from a container.
 */

import type { ConflictResolutionPolicy, IndexingPolicy, UniqueKeyPolicy } from "@azure/cosmos";
import { CosmosClient } from "@azure/cosmos";
import type { CosmioConnectionConfig } from "../config/define-config.js";

export interface ContainerMetadata {
  id: string;
  partitionKeyPaths: string[];
  indexingPolicy: IndexingPolicy | undefined;
  defaultTtl: number | undefined;
  uniqueKeyPolicy: UniqueKeyPolicy | undefined;
  conflictResolutionPolicy: ConflictResolutionPolicy | undefined;
}

export interface SampleResult {
  metadata: ContainerMetadata;
  documents: Record<string, unknown>[];
}

const SYSTEM_FIELDS = new Set(["_rid", "_self", "_ts", "_etag", "_attachments"]);

function stripSystemFields(doc: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (!SYSTEM_FIELDS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Connect to a Cosmos DB container, read its metadata, and sample documents.
 */
export async function sampleContainer(
  connection: CosmioConnectionConfig,
  containerName: string,
  sampleSize: number,
  where?: string,
): Promise<SampleResult> {
  let client: CosmosClient;
  if (connection.connectionString) {
    client = new CosmosClient(connection.connectionString);
  } else if (connection.endpoint && connection.key) {
    client = new CosmosClient({ endpoint: connection.endpoint, key: connection.key });
  } else {
    throw new Error(
      "Connection requires either connectionString or endpoint+key. " +
        "Set via config, CLI args, or environment variables (COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_CONNECTION_STRING).",
    );
  }

  const container = client.database(connection.database).container(containerName);

  // Read container metadata
  const { resource: containerDef } = await container.read();
  if (!containerDef) {
    throw new Error(`Container "${containerName}" not found in database "${connection.database}".`);
  }

  const pkDef = containerDef.partitionKey;
  const partitionKeyPaths: string[] =
    pkDef && typeof pkDef === "object" && "paths" in pkDef ? (pkDef.paths as string[]) : [];

  const metadata: ContainerMetadata = {
    id: containerDef.id,
    partitionKeyPaths,
    indexingPolicy: containerDef.indexingPolicy,
    defaultTtl: containerDef.defaultTtl,
    uniqueKeyPolicy: containerDef.uniqueKeyPolicy,
    conflictResolutionPolicy: containerDef.conflictResolutionPolicy,
  };

  // Sample documents
  let query = `SELECT TOP @n * FROM c`;
  const parameters = [{ name: "@n", value: sampleSize }];

  if (where) {
    query += ` WHERE ${where}`;
  }

  const { resources } = await container.items
    .query<Record<string, unknown>>({ query, parameters })
    .fetchAll();

  const documents = resources.map(stripSystemFields);

  return { metadata, documents };
}
