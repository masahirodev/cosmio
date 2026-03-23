import type { z } from "zod";

// ---------------------------------------------------------------------------
// Per-field filter operators — type-safe, Prisma-style
// ---------------------------------------------------------------------------

/** String field filter operators */
export interface StringFilter {
  equals?: string;
  not?: string;
  contains?: string;
  startsWith?: string;
  endsWith?: string;
  in?: string[];
}

/** Number field filter operators */
export interface NumberFilter {
  equals?: number;
  not?: number;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  in?: number[];
}

/** Boolean field filter operators */
export interface BooleanFilter {
  equals?: boolean;
  not?: boolean;
}

/** Generic filter for other types */
export interface GenericFilter<T> {
  equals?: T;
  not?: T;
}

/**
 * Map a TypeScript type to its available filter operators.
 * - string → StringFilter | string (shorthand for equals)
 * - number → NumberFilter | number
 * - boolean → BooleanFilter | boolean
 * - other → GenericFilter | value
 */
export type FilterFor<T> = T extends string
  ? StringFilter | string
  : T extends number
    ? NumberFilter | number
    : T extends boolean
      ? BooleanFilter | boolean
      : GenericFilter<T> | T;

/**
 * Prisma-style where input derived from a Zod schema.
 * Each field can be a direct value (shorthand for equals) or a filter object.
 *
 * @example
 * ```ts
 * const where: WhereInput<typeof UserSchema> = {
 *   name: { contains: "Alice" },      // string filter
 *   age: { gte: 18 },                 // number filter
 *   status: "active",                 // shorthand for { equals: "active" }
 *   isAdmin: { equals: true },        // boolean filter
 * };
 * ```
 */
export type WhereInput<TSchema extends z.ZodObject<z.ZodRawShape>> = {
  [K in keyof z.infer<TSchema>]?: FilterFor<z.infer<TSchema>[K]>;
};
