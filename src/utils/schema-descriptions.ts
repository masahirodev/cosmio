import type { z } from "zod";

/**
 * Extract field descriptions from a Zod schema.
 * Uses Zod's `.describe()` metadata.
 *
 * @example
 * ```ts
 * const schema = z.object({
 *   id: z.string().describe("Unique document identifier"),
 *   tenantId: z.string().describe("Tenant partition key"),
 *   name: z.string().describe("User's display name"),
 * });
 *
 * const desc = extractDescriptions(schema);
 * // → { id: "Unique document identifier", tenantId: "Tenant partition key", name: "User's display name" }
 * ```
 */
export function extractDescriptions(
  schema: z.ZodObject<z.ZodRawShape>,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(schema.shape)) {
    const zodType = value as z.ZodTypeAny;
    result[key] = resolveDescription(zodType);
  }

  return result;
}

function resolveDescription(type: z.ZodTypeAny): string | undefined {
  if (type.description) return type.description;

  // Unwrap wrappers to find inner description
  const def = type._def;
  if (
    def.typeName === "ZodOptional" ||
    def.typeName === "ZodNullable" ||
    def.typeName === "ZodDefault"
  ) {
    return resolveDescription(def.innerType);
  }

  return undefined;
}
