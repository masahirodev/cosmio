/**
 * Cosmos DB system-generated fields present on all documents.
 */
export interface CosmosSystemFields {
  /** Resource ID */
  _rid: string;
  /** Self link */
  _self: string;
  /** Entity tag for optimistic concurrency */
  _etag: string;
  /** Last modified timestamp (epoch seconds) */
  _ts: number;
}

/**
 * A document as returned from Cosmos DB, including system fields.
 */
export type WithSystemFields<T> = T & Partial<CosmosSystemFields>;
