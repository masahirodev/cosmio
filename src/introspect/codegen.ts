/**
 * TypeScript code generation from InferredSchema.
 * Produces a complete defineModel() source file.
 */

import type { ContainerMetadata } from "./sample.js";
import type { InferredField, InferredSchema, InferredType } from "./infer-schema.js";

export interface CodegenOptions {
  modelName: string;
  containerName: string;
  partitionKeyPaths: string[];
  schema: InferredSchema;
  metadata: ContainerMetadata;
  includeIndexingPolicy?: boolean;
}

/**
 * Generate a complete TypeScript model source file.
 */
export function generateModelSource(options: CodegenOptions): string {
  const {
    modelName,
    containerName,
    partitionKeyPaths,
    schema,
    metadata,
    includeIndexingPolicy = true,
  } = options;

  const lines: string[] = [];

  // Imports
  lines.push('import { z } from "zod";');
  lines.push('import { defineModel } from "cosmio";');
  lines.push("");

  // Model definition
  lines.push(`export const ${modelName}Model = defineModel({`);
  lines.push(`  name: "${modelName}",`);
  lines.push(`  container: "${containerName}",`);

  // Partition key
  const pkLiteral = partitionKeyPaths.map((p) => `"${p}"`).join(", ");
  lines.push(`  partitionKey: [${pkLiteral}] as const,`);

  // Schema
  lines.push("  schema: z.object({");
  const fieldEntries = Object.entries(schema.fields);
  // Ensure id comes first
  fieldEntries.sort(([a], [b]) => {
    if (a === "id") return -1;
    if (b === "id") return 1;
    return 0;
  });
  for (const [fieldName, field] of fieldEntries) {
    const zodExpr = renderZodType(field.type, 4);
    const suffixes: string[] = [];
    if (field.nullable) suffixes.push(".nullable()");
    if (field.optional) suffixes.push(".optional()");
    lines.push(`    ${fieldName}: ${zodExpr}${suffixes.join("")},`);
  }
  lines.push("  }),");

  // Discriminator
  if (schema.possibleDiscriminators.length > 0) {
    const disc = schema.possibleDiscriminators[0]!;
    lines.push(`  discriminator: { field: "${disc.field}", value: "${disc.value}" },`);
  }

  // Container-level metadata
  if (includeIndexingPolicy && metadata.indexingPolicy) {
    lines.push(`  indexingPolicy: ${jsonIndent(metadata.indexingPolicy, 2)},`);
  }

  if (metadata.defaultTtl !== undefined) {
    lines.push(`  defaultTtl: ${metadata.defaultTtl},`);
  }

  if (metadata.uniqueKeyPolicy) {
    lines.push(`  uniqueKeyPolicy: ${jsonIndent(metadata.uniqueKeyPolicy, 2)},`);
  }

  if (metadata.conflictResolutionPolicy) {
    lines.push(`  conflictResolutionPolicy: ${jsonIndent(metadata.conflictResolutionPolicy, 2)},`);
  }

  lines.push("});");
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Zod type rendering
// ---------------------------------------------------------------------------

function renderZodType(type: InferredType, indent: number): string {
  switch (type.kind) {
    case "string":
      return "z.string()";
    case "number":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
    case "unknown":
      return "z.unknown()";
    case "literal":
      return typeof type.value === "string"
        ? `z.literal("${escapeString(type.value)}")`
        : `z.literal(${type.value})`;
    case "enum": {
      const values = type.values
        .map((v) => (typeof v === "string" ? `"${escapeString(v)}"` : String(v)))
        .join(", ");
      return `z.enum([${values}])`;
    }
    case "array":
      return `z.array(${renderZodType(type.element, indent)})`;
    case "object":
      return renderZodObject(type.fields, indent);
    case "union": {
      const variants = type.variants.map((v) => renderZodType(v, indent)).join(", ");
      return `z.union([${variants}])`;
    }
  }
}

function renderZodObject(fields: Record<string, InferredField>, indent: number): string {
  const entries = Object.entries(fields);
  if (entries.length === 0) return "z.object({})";

  const pad = " ".repeat(indent + 2);
  const closePad = " ".repeat(indent);
  const fieldLines = entries.map(([name, field]) => {
    const zodExpr = renderZodType(field.type, indent + 2);
    const suffixes: string[] = [];
    if (field.nullable) suffixes.push(".nullable()");
    if (field.optional) suffixes.push(".optional()");
    return `${pad}${name}: ${zodExpr}${suffixes.join("")},`;
  });

  return `z.object({\n${fieldLines.join("\n")}\n${closePad}})`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function jsonIndent(value: unknown, baseIndent: number): string {
  const json = JSON.stringify(value, null, 2);
  // Re-indent lines after the first
  const pad = " ".repeat(baseIndent);
  return json.replace(/\n/g, `\n${pad}`);
}

// ---------------------------------------------------------------------------
// Naming utilities
// ---------------------------------------------------------------------------

/**
 * Convert a container name to PascalCase model name.
 * "user-events" → "UserEvent"
 * "users" → "User"
 * "orderItems" → "OrderItem"
 */
export function toPascalCase(name: string): string {
  // Split on hyphens, underscores, spaces, and camelCase boundaries
  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[-_\s]+/)
    .filter(Boolean);

  const result = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");

  // Naive singularization: strip trailing "s" unless it ends in "ss", "us", "is"
  if (result.endsWith("s") && !/(ss|us|is)$/i.test(result)) {
    return result.slice(0, -1);
  }

  return result;
}
