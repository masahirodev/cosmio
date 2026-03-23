import type { z } from "zod";
import type { ModelDefinition } from "../model/model-types.js";

type AnyModelDefinition = ModelDefinition<
  z.ZodObject<z.ZodRawShape>,
  readonly [string, ...string[]]
>;

export interface MermaidOptions {
  /** Diagram title (rendered as a Mermaid title directive) */
  title?: string;
}

/**
 * Generate a Mermaid ER diagram showing Cosmos DB model structures.
 *
 * - Each model is rendered as an entity with its fields
 * - Partition key fields are annotated
 * - Discriminator fields are annotated
 * - Models sharing the same container are visually linked
 *
 * @example
 * ```ts
 * const diagram = toMermaidER([ArticleModel, CommentModel]);
 * ```
 */
export function toMermaidER(models: AnyModelDefinition[], options: MermaidOptions = {}): string {
  const { title } = options;
  const lines: string[] = [];

  if (title) {
    lines.push("---");
    lines.push(`title: ${title}`);
    lines.push("---");
  }

  lines.push("erDiagram");

  // Entity definitions
  for (const model of models) {
    lines.push(`  ${model.name} {`);

    const shape = model.schema.shape;
    const pkFields = new Set(model.partitionKey.map((p) => (p.startsWith("/") ? p.slice(1) : p)));

    for (const [fieldName, zodType] of Object.entries(shape)) {
      const { typeName, isOptional } = describeFieldType(zodType as z.ZodTypeAny);

      const comments: string[] = [];

      if (fieldName === "id") {
        comments.push("document id");
      }
      if (pkFields.has(fieldName)) {
        comments.push("partition key");
      }
      if (model.discriminator && fieldName === model.discriminator.field) {
        comments.push(`discriminator: ${model.discriminator.value}`);
      }
      if (isOptional) {
        comments.push("optional");
      }

      const commentStr = comments.length > 0 ? ` "${comments.join(", ")}"` : "";

      lines.push(`    ${typeName} ${fieldName}${commentStr}`);
    }

    lines.push("  }");
  }

  // Models sharing the same container are linked
  const containerModels = new Map<string, string[]>();
  for (const model of models) {
    const existing = containerModels.get(model.container);
    if (existing) {
      existing.push(model.name);
    } else {
      containerModels.set(model.container, [model.name]);
    }
  }

  for (const [container, modelNames] of containerModels) {
    if (modelNames.length < 2) continue;
    // Link all models in the same container pairwise
    for (let i = 0; i < modelNames.length; i++) {
      for (let j = i + 1; j < modelNames.length; j++) {
        lines.push(`  ${modelNames[i]} }|--|{ ${modelNames[j]} : "same container: ${container}"`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

function describeFieldType(type: z.ZodTypeAny): {
  typeName: string;
  isOptional: boolean;
} {
  const def = type._def as unknown as Record<string, unknown>;

  if (def.type === "optional") {
    const inner = describeFieldType(def.innerType as z.ZodTypeAny);
    return { ...inner, isOptional: true };
  }
  if (def.type === "nullable") {
    const inner = describeFieldType(def.innerType as z.ZodTypeAny);
    return { typeName: inner.typeName, isOptional: inner.isOptional };
  }
  if (def.type === "default") {
    const inner = describeFieldType(def.innerType as z.ZodTypeAny);
    return { ...inner, isOptional: true };
  }

  const typeMap: Record<string, string> = {
    string: "string",
    number: "number",
    boolean: "boolean",
    date: "datetime",
    array: "array",
    object: "object",
    enum: "enum",
    literal: "string",
    union: "union",
    record: "object",
  };

  const typeName = typeMap[def.type as string] ?? "unknown";

  return { typeName, isOptional: false };
}
