import type { z } from "zod";
import type { WithSystemFields } from "./system-fields.js";

/**
 * The input type for creating a document (what the user provides).
 */
export type CreateInput<TSchema extends z.ZodTypeAny> = z.input<TSchema>;

/**
 * The validated output type (after Zod parsing).
 */
export type ModelOutput<TSchema extends z.ZodTypeAny> = z.output<TSchema>;

/**
 * A document as read from Cosmos DB (output type + system fields).
 */
export type DocumentRead<TSchema extends z.ZodTypeAny> = WithSystemFields<z.output<TSchema>>;
