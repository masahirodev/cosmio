import type { z } from "zod";
import type { DefaultsMap, ModelDefinition } from "../model/model-types.js";

// ---------------------------------------------------------------------------
// Input types (Azure AI Skills 風の構造化入力)
// ---------------------------------------------------------------------------

/** How a field is used in queries. */
export type FieldUsage = "filter" | "sort" | "select" | "group";

/** An access pattern describes how your application reads/writes a model. */
export interface AccessPattern {
  /** Human-readable name (e.g., "List inspections by tenant") */
  name: string;
  /** Operation type */
  operation: "point-read" | "query" | "create" | "upsert" | "delete" | "patch";
  /** Estimated calls per second (for RU calculation) */
  rps?: number;
  /** Estimated document size in bytes */
  avgDocumentSizeBytes?: number;
  /** Fields used and how they are used */
  fields?: {
    field: string;
    usage: FieldUsage;
    operator?: string;
  }[];
  /** Expected result set size for queries */
  expectedResultCount?: number;
  /** Description */
  description?: string;
}

/** A model with its access patterns — single skill input record. */
export interface ModelWithPatterns {
  model: ModelDefinition<
    z.ZodObject<z.ZodRawShape>,
    readonly [string, ...string[]],
    DefaultsMap<z.ZodObject<z.ZodRawShape>>
  >;
  patterns: AccessPattern[];
}

// ---------------------------------------------------------------------------
// Azure Advisor カテゴリ (5 pillars)
// ---------------------------------------------------------------------------

/**
 * Azure Advisor の 5 カテゴリに合わせた分類。
 * https://learn.microsoft.com/azure/cosmos-db/automated-recommendations
 */
export type AdvisorCategory =
  | "cost"
  | "performance"
  | "reliability"
  | "security"
  | "operational-excellence";

export type Severity = "error" | "warning" | "info" | "suggestion";

// ---------------------------------------------------------------------------
// Cosmos DB Design Patterns
// https://github.com/Azure-Samples/cosmos-db-design-patterns
// ---------------------------------------------------------------------------

/**
 * Official Cosmos DB design patterns from Azure Samples.
 */
export type CosmosDesignPattern =
  | "attribute-array"
  | "data-binning"
  | "distributed-counter"
  | "distributed-lock"
  | "document-versioning"
  | "event-sourcing"
  | "materialized-view"
  | "preallocation"
  | "schema-versioning";

export interface DesignPatternRecommendation {
  pattern: CosmosDesignPattern;
  reason: string;
  /** Link to the official sample */
  referenceUrl: string;
}

// ---------------------------------------------------------------------------
// Skill output types (Azure AI Skills 風の構造化出力)
// ---------------------------------------------------------------------------

/**
 * A single finding from the advisor.
 * Follows Azure Advisor recommendation structure.
 */
export interface AdvisorFinding {
  /** Unique advice ID (e.g., "PK001", "IDX002") */
  adviceId: string;
  severity: Severity;
  category: AdvisorCategory;
  model: string;
  title: string;
  detail: string;
  recommendation: string;
  /** Related official design pattern, if applicable */
  designPattern?: DesignPatternRecommendation;
  /** Link to Azure docs */
  documentationUrl?: string;
}

/** RU estimate for an access pattern. */
export interface RUEstimate {
  pattern: string;
  model: string;
  operation: string;
  estimatedRU: number;
  totalRUPerSecond: number;
  notes: string;
}

/** Cost breakdown per model. */
export interface CostBreakdown {
  model: string;
  readRUPerSecond: number;
  writeRUPerSecond: number;
  totalRUPerSecond: number;
  estimatedMonthlyCostUSD: number;
  throughputRecommendation: "serverless" | "provisioned" | "autoscale";
}

/**
 * Full advisor report — structured output following Azure AI Skills pattern.
 *
 * Each record in the pipeline produces:
 * - findings (with adviceId, severity, category)
 * - ruEstimates
 * - costBreakdown
 * - designPatternRecommendations
 * - summary
 */
export interface AdvisorReport {
  findings: AdvisorFinding[];
  ruEstimates: RUEstimate[];
  costBreakdowns: CostBreakdown[];
  designPatternRecommendations: DesignPatternRecommendation[];
  summary: string;
}
