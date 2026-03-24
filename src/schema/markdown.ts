import type { z } from "zod";
import type { ModelDefinition } from "../model/model-types.js";

/**
 * Generate Markdown documentation for a single model.
 */
export function toMarkdown<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TPaths extends readonly [string, ...string[]],
>(model: ModelDefinition<TSchema, TPaths>): string {
  const lines: string[] = [];

  lines.push(`## ${model.name}`);
  lines.push("");

  if (model.description) {
    lines.push(model.description);
    lines.push("");
  }

  lines.push(`**Container:** \`${model.container}\``);
  lines.push(`**Partition Key:** ${model.partitionKey.map((p) => `\`${p}\``).join(", ")}`);

  if (model.discriminator) {
    lines.push(
      `**Discriminator:** \`${model.discriminator.field}\` = \`"${model.discriminator.value}"\``,
    );
  }
  lines.push("");

  // Field table
  lines.push("### Fields");
  lines.push("");
  lines.push("| Field | Type | Required | Description |");
  lines.push("|-------|------|----------|-------------|");

  const shape = model.schema.shape;
  for (const [fieldName, zodType] of Object.entries(shape)) {
    const { typeName, isOptional, description } = describeZodType(zodType as z.ZodTypeAny);
    lines.push(
      `| \`${fieldName}\` | ${typeName} | ${isOptional ? "No" : "Yes"} | ${description} |`,
    );
  }

  lines.push("");

  return lines.join("\n");
}

/**
 * Generate Markdown documentation for multiple models.
 */
export function toMarkdownDoc(
  models: ModelDefinition<z.ZodObject<z.ZodRawShape>, readonly [string, ...string[]]>[],
  options?: { title?: string },
): string {
  const lines: string[] = [];
  const title = options?.title ?? "Model Documentation";

  lines.push(`# ${title}`);
  lines.push("");

  for (const model of models) {
    lines.push(toMarkdown(model));
  }

  return lines.join("\n");
}

function describeZodType(type: z.ZodTypeAny): {
  typeName: string;
  isOptional: boolean;
  description: string;
} {
  const description = type.description ?? "";
  const def = type._def as unknown as Record<string, unknown>;

  // Unwrap optional/nullable
  if (def.type === "optional") {
    const inner = describeZodType(def.innerType as z.ZodTypeAny);
    return { ...inner, isOptional: true, description: description || inner.description };
  }
  if (def.type === "nullable") {
    const inner = describeZodType(def.innerType as z.ZodTypeAny);
    return {
      typeName: `${inner.typeName} \\| null`,
      isOptional: inner.isOptional,
      description: description || inner.description,
    };
  }
  if (def.type === "default") {
    const inner = describeZodType(def.innerType as z.ZodTypeAny);
    return { ...inner, isOptional: true, description: description || inner.description };
  }

  const typeMap: Record<string, string> = {
    string: "string",
    number: "number",
    boolean: "boolean",
    date: "Date",
    array: "array",
    object: "object",
    enum: "enum",
    literal: "literal",
    union: "union",
    record: "record",
    any: "any",
    unknown: "unknown",
  };

  const typeName =
    def.type === "literal"
      ? `\`${JSON.stringify((def.values as unknown[])?.[0] ?? def.value)}\``
      : (typeMap[def.type as string] ?? (def.type as string) ?? "unknown");

  return { typeName, isOptional: false, description };
}
