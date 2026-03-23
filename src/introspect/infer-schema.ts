/**
 * Schema inference engine.
 * Analyzes sampled documents and produces a platform-agnostic schema descriptor.
 * No Zod dependency — codegen handles the Zod-specific output.
 */

// ---------------------------------------------------------------------------
// Schema descriptor types
// ---------------------------------------------------------------------------

export type InferredType =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "enum"; values: (string | number)[] }
  | { kind: "array"; element: InferredType }
  | { kind: "object"; fields: Record<string, InferredField> }
  | { kind: "union"; variants: InferredType[] }
  | { kind: "unknown" };

export interface InferredField {
  type: InferredType;
  /** Field is not present in all sampled documents */
  optional: boolean;
  /** Some documents have null for this field */
  nullable: boolean;
}

export interface InferredSchema {
  fields: Record<string, InferredField>;
  /** Fields that have exactly one distinct value across all documents */
  possibleDiscriminators: Array<{ field: string; value: string }>;
}

export interface InferSchemaOptions {
  /** Max distinct values to consider as enum (default: 10) */
  enumThreshold?: number;
  /** Max object nesting depth (default: 10) */
  maxDepth?: number;
}

// ---------------------------------------------------------------------------
// System fields to exclude
// ---------------------------------------------------------------------------

const SYSTEM_FIELDS = new Set(["_rid", "_self", "_ts", "_etag", "_attachments"]);

// ---------------------------------------------------------------------------
// Internal collection types
// ---------------------------------------------------------------------------

interface FieldStats {
  /** How many documents contain this field */
  count: number;
  /** Observed typeof values (excluding null) */
  types: Set<string>;
  /** Whether null was observed */
  hasNull: boolean;
  /** Distinct primitive values (tracked up to threshold + 1) */
  distinctValues: Set<unknown>;
  /** Overflow flag: stopped tracking distinct values */
  distinctOverflow: boolean;
  /** For nested objects: per-field stats */
  nestedFields: Map<string, FieldStats> | undefined;
  /** For arrays: stats of all observed elements */
  arrayElementStats: FieldStats | undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function inferSchema(
  documents: Record<string, unknown>[],
  options: InferSchemaOptions = {},
): InferredSchema {
  const { enumThreshold = 10, maxDepth = 10 } = options;
  const totalDocs = documents.length;

  if (totalDocs === 0) {
    return { fields: {}, possibleDiscriminators: [] };
  }

  // Phase 1: Collect stats
  const rootStats = new Map<string, FieldStats>();
  for (const doc of documents) {
    collectObjectStats(rootStats, doc, enumThreshold, maxDepth, 0);
  }

  // Phase 2: Resolve to schema
  const fields: Record<string, InferredField> = {};
  const possibleDiscriminators: InferredSchema["possibleDiscriminators"] = [];

  for (const [fieldName, stats] of rootStats) {
    if (SYSTEM_FIELDS.has(fieldName)) continue;

    const field = resolveField(stats, totalDocs, enumThreshold);
    fields[fieldName] = field;

    // Discriminator detection: single string value across ALL documents
    if (
      !field.optional &&
      !field.nullable &&
      field.type.kind === "literal" &&
      typeof field.type.value === "string"
    ) {
      possibleDiscriminators.push({ field: fieldName, value: field.type.value });
    }
  }

  return { fields, possibleDiscriminators };
}

// ---------------------------------------------------------------------------
// Phase 1: Collect
// ---------------------------------------------------------------------------

function collectObjectStats(
  statsMap: Map<string, FieldStats>,
  obj: Record<string, unknown>,
  enumThreshold: number,
  maxDepth: number,
  depth: number,
): void {
  for (const [key, value] of Object.entries(obj)) {
    let stats = statsMap.get(key);
    if (!stats) {
      stats = createFieldStats();
      statsMap.set(key, stats);
    }
    stats.count++;
    collectValueStats(stats, value, enumThreshold, maxDepth, depth);
  }
}

function collectValueStats(
  stats: FieldStats,
  value: unknown,
  enumThreshold: number,
  maxDepth: number,
  depth: number,
): void {
  if (value === null) {
    stats.hasNull = true;
    return;
  }

  const t = typeof value;

  if (t === "string" || t === "number" || t === "boolean") {
    stats.types.add(t);
    if (!stats.distinctOverflow) {
      stats.distinctValues.add(value);
      if (stats.distinctValues.size > enumThreshold) {
        stats.distinctOverflow = true;
        stats.distinctValues.clear(); // free memory
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    stats.types.add("array");
    if (depth < maxDepth) {
      if (!stats.arrayElementStats) {
        stats.arrayElementStats = createFieldStats();
      }
      for (const elem of value) {
        stats.arrayElementStats.count++;
        collectValueStats(stats.arrayElementStats, elem, enumThreshold, maxDepth, depth + 1);
      }
    }
    return;
  }

  if (t === "object") {
    stats.types.add("object");
    if (depth < maxDepth) {
      if (!stats.nestedFields) {
        stats.nestedFields = new Map();
      }
      collectObjectStats(
        stats.nestedFields,
        value as Record<string, unknown>,
        enumThreshold,
        maxDepth,
        depth + 1,
      );
    }
    return;
  }

  // Fallback: unknown type
  stats.types.add("unknown");
}

function createFieldStats(): FieldStats {
  return {
    count: 0,
    types: new Set(),
    hasNull: false,
    distinctValues: new Set(),
    distinctOverflow: false,
    nestedFields: undefined,
    arrayElementStats: undefined,
  };
}

// ---------------------------------------------------------------------------
// Phase 2: Resolve
// ---------------------------------------------------------------------------

function resolveField(stats: FieldStats, totalDocs: number, enumThreshold: number): InferredField {
  const optional = stats.count < totalDocs;
  const nullable = stats.hasNull;
  const type = resolveType(stats, enumThreshold);
  return { type, optional, nullable };
}

function resolveType(stats: FieldStats, enumThreshold: number): InferredType {
  const types = stats.types;

  // No non-null types observed
  if (types.size === 0) {
    return { kind: "unknown" };
  }

  // Single primitive type
  if (types.size === 1) {
    const t = [...types][0]!;

    if (t === "object" && stats.nestedFields) {
      return resolveObjectType(stats.nestedFields, stats.count, enumThreshold);
    }

    if (t === "array") {
      return resolveArrayType(stats.arrayElementStats, enumThreshold);
    }

    if (t === "string" || t === "number" || t === "boolean") {
      return resolvePrimitiveType(t, stats, enumThreshold);
    }

    return { kind: "unknown" };
  }

  // Multiple types → union
  const variants: InferredType[] = [];
  for (const t of types) {
    if (t === "string") variants.push({ kind: "string" });
    else if (t === "number") variants.push({ kind: "number" });
    else if (t === "boolean") variants.push({ kind: "boolean" });
    else if (t === "object" && stats.nestedFields)
      variants.push(resolveObjectType(stats.nestedFields, stats.count, enumThreshold));
    else if (t === "array") variants.push(resolveArrayType(stats.arrayElementStats, enumThreshold));
    else variants.push({ kind: "unknown" });
  }

  return { kind: "union", variants };
}

function resolvePrimitiveType(
  t: "string" | "number" | "boolean",
  stats: FieldStats,
  enumThreshold: number,
): InferredType {
  // Check for literal (single distinct value)
  if (!stats.distinctOverflow && stats.distinctValues.size === 1) {
    const value = [...stats.distinctValues][0] as string | number | boolean;
    return { kind: "literal", value };
  }

  // Check for enum (small set of distinct values, string or number only)
  if (
    !stats.distinctOverflow &&
    stats.distinctValues.size >= 2 &&
    stats.distinctValues.size <= enumThreshold &&
    (t === "string" || t === "number")
  ) {
    const values = [...stats.distinctValues].sort() as (string | number)[];
    return { kind: "enum", values };
  }

  return { kind: t };
}

function resolveObjectType(
  nestedFields: Map<string, FieldStats>,
  parentCount: number,
  enumThreshold: number,
): InferredType {
  const fields: Record<string, InferredField> = {};
  for (const [key, fieldStats] of nestedFields) {
    fields[key] = resolveField(fieldStats, parentCount, enumThreshold);
  }
  return { kind: "object", fields };
}

function resolveArrayType(
  elementStats: FieldStats | undefined,
  enumThreshold: number,
): InferredType {
  if (!elementStats || elementStats.count === 0) {
    return { kind: "array", element: { kind: "unknown" } };
  }
  const element = resolveType(elementStats, enumThreshold);
  return { kind: "array", element };
}
