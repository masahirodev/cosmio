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
  const def = type._def as unknown as Record<string, unknown>;
  if (def.type === "optional" || def.type === "nullable" || def.type === "default") {
    return resolveDescription(def.innerType as z.ZodTypeAny);
  }

  return undefined;
}
