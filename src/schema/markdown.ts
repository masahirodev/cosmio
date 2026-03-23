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

  // Unwrap optional/nullable
  if (type._def.typeName === "ZodOptional") {
    const inner = describeZodType(type._def.innerType);
    return { ...inner, isOptional: true, description: description || inner.description };
  }
  if (type._def.typeName === "ZodNullable") {
    const inner = describeZodType(type._def.innerType);
    return {
      typeName: `${inner.typeName} \\| null`,
      isOptional: inner.isOptional,
      description: description || inner.description,
    };
  }
  if (type._def.typeName === "ZodDefault") {
    const inner = describeZodType(type._def.innerType);
    return { ...inner, isOptional: true, description: description || inner.description };
  }

  const typeMap: Record<string, string> = {
    ZodString: "string",
    ZodNumber: "number",
    ZodBoolean: "boolean",
    ZodDate: "Date",
    ZodArray: "array",
    ZodObject: "object",
    ZodEnum: "enum",
    ZodLiteral: `literal`,
    ZodUnion: "union",
    ZodRecord: "record",
    ZodAny: "any",
    ZodUnknown: "unknown",
  };

  const typeName =
    type._def.typeName === "ZodLiteral"
      ? `\`${JSON.stringify(type._def.value)}\``
      : (typeMap[type._def.typeName as string] ?? type._def.typeName ?? "unknown");

  return { typeName, isOptional: false, description };
}
