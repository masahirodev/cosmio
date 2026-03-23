export type CosmioErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "TOO_MANY_REQUESTS"
  | "VALIDATION_ERROR"
  | "COSMOS_ERROR";

export class CosmioError extends Error {
  readonly code: CosmioErrorCode;
  readonly statusCode: number | undefined;

  constructor(message: string, code: CosmioErrorCode, statusCode?: number) {
    super(message);
    this.name = "CosmioError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class NotFoundError extends CosmioError {
  constructor(message = "Resource not found") {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends CosmioError {
  constructor(message = "Resource already exists") {
    super(message, "CONFLICT", 409);
    this.name = "ConflictError";
  }
}

export class PreconditionFailedError extends CosmioError {
  constructor(message = "Precondition failed (ETag mismatch)") {
    super(message, "PRECONDITION_FAILED", 412);
    this.name = "PreconditionFailedError";
  }
}

export class TooManyRequestsError extends CosmioError {
  readonly retryAfterMs: number | undefined;

  constructor(message = "Too many requests", retryAfterMs?: number) {
    super(message, "TOO_MANY_REQUESTS", 429);
    this.name = "TooManyRequestsError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class ValidationError extends CosmioError {
  readonly issues: unknown[];

  constructor(message: string, issues: unknown[]) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/**
 * Map a Cosmos DB error (by status code) to a typed CosmioError.
 */
export function mapCosmosError(error: unknown): CosmioError {
  if (error instanceof CosmioError) {
    return error;
  }

  let statusCode: number | undefined;
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    // Cosmos SDK uses 'code' (number or string) or 'statusCode'
    const raw = e.code ?? e.statusCode;
    statusCode =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number.parseInt(raw, 10) || undefined
          : undefined;
  }

  const message = error instanceof Error ? error.message : "Unknown Cosmos DB error";

  switch (statusCode) {
    case 404:
      return new NotFoundError(message);
    case 409:
      return new ConflictError(message);
    case 412:
      return new PreconditionFailedError(message);
    case 429: {
      const retryAfter =
        typeof error === "object" && error !== null && "retryAfterInMs" in error
          ? (error as { retryAfterInMs: number }).retryAfterInMs
          : undefined;
      return new TooManyRequestsError(message, retryAfter);
    }
    default:
      return new CosmioError(message, "COSMOS_ERROR", statusCode);
  }
}
