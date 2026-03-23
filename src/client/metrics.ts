/**
 * Result with RU consumption metrics.
 */
export interface WithMetrics<T> {
  result: T;
  /** Request Units consumed by this operation */
  ru: number;
}

/**
 * Extract RU charge from Cosmos DB response headers.
 */
export function extractRU(headers: Record<string, unknown> | undefined): number {
  if (!headers) return 0;
  const charge = headers["x-ms-request-charge"];
  if (typeof charge === "number") return charge;
  if (typeof charge === "string") return Number.parseFloat(charge) || 0;
  return 0;
}
