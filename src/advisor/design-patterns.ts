import type { CosmosDesignPattern, DesignPatternRecommendation } from "./types.js";

const BASE_URL = "https://github.com/Azure-Samples/cosmos-db-design-patterns/tree/main";

interface PatternInfo {
  name: string;
  description: string;
  whenToUse: string;
}

/**
 * Cosmos DB design pattern catalog.
 * Source: https://github.com/Azure-Samples/cosmos-db-design-patterns
 */
export const DESIGN_PATTERNS: Record<CosmosDesignPattern, PatternInfo> = {
  "attribute-array": {
    name: "Attribute Array",
    description:
      "Store and query multiple attributes of an entity within a single document using arrays.",
    whenToUse: "When multiple related attributes need efficient querying within one document.",
  },
  "data-binning": {
    name: "Data Binning",
    description:
      "Organize and group data points into predefined bins for easy analysis and retrieval.",
    whenToUse:
      "When categorizing or aggregating time-series or metric data into logical groupings.",
  },
  "distributed-counter": {
    name: "Distributed Counter",
    description:
      "Efficiently maintain and update counts across multiple documents to avoid contention.",
    whenToUse: "When tracking cumulative metrics with high concurrency (likes, views, inventory).",
  },
  "distributed-lock": {
    name: "Distributed Lock",
    description: "Implement distributed locks for managing concurrent access to resources.",
    whenToUse:
      "When multiple instances need to coordinate exclusive access to prevent race conditions.",
  },
  "document-versioning": {
    name: "Document Versioning",
    description: "Manage document versioning to track changes over time with audit trails.",
    whenToUse: "When maintaining an audit trail or tracking entity evolution over its lifecycle.",
  },
  "event-sourcing": {
    name: "Event Sourcing",
    description:
      "Maintain a history of changes as a sequence of events to reconstruct application state.",
    whenToUse: "When requiring complete audit trails, temporal queries, or state replay.",
  },
  "materialized-view": {
    name: "Materialized View",
    description:
      "Create and manage materialized views to efficiently retrieve precomputed/denormalized data.",
    whenToUse:
      "When query patterns require denormalized data or precomputed aggregations for read performance.",
  },
  preallocation: {
    name: "Preallocation",
    description: "Preallocate resources such as document IDs or slots to optimize performance.",
    whenToUse: "When reserving identifiers or resources in advance to reduce latency.",
  },
  "schema-versioning": {
    name: "Schema Versioning",
    description: "Manage data model changes over time while maintaining backward compatibility.",
    whenToUse: "When evolving schemas across versions without forcing migrations on existing data.",
  },
};

/**
 * Create a design pattern recommendation.
 */
export function recommendPattern(
  pattern: CosmosDesignPattern,
  reason: string,
): DesignPatternRecommendation {
  return {
    pattern,
    reason,
    referenceUrl: `${BASE_URL}/${pattern}/`,
  };
}

/**
 * Get the full info for a design pattern.
 */
export function getPatternInfo(pattern: CosmosDesignPattern): PatternInfo {
  return DESIGN_PATTERNS[pattern];
}
