import { describe, expect, it } from "vitest";
import {
  ConflictError,
  CosmioError,
  mapCosmosError,
  NotFoundError,
  PreconditionFailedError,
  TooManyRequestsError,
} from "../../src/errors/index.js";

describe("mapCosmosError", () => {
  it("maps 404 to NotFoundError", () => {
    const error = Object.assign(new Error("not found"), { code: 404 });
    const result = mapCosmosError(error);

    expect(result).toBeInstanceOf(NotFoundError);
    expect(result.code).toBe("NOT_FOUND");
    expect(result.statusCode).toBe(404);
    expect(result.message).toBe("not found");
  });

  it("maps 409 to ConflictError", () => {
    const error = Object.assign(new Error("conflict"), { code: 409 });
    const result = mapCosmosError(error);

    expect(result).toBeInstanceOf(ConflictError);
    expect(result.code).toBe("CONFLICT");
    expect(result.statusCode).toBe(409);
    expect(result.message).toBe("conflict");
  });

  it("maps 412 to PreconditionFailedError", () => {
    const error = Object.assign(new Error("etag mismatch"), { code: 412 });
    const result = mapCosmosError(error);

    expect(result).toBeInstanceOf(PreconditionFailedError);
    expect(result.code).toBe("PRECONDITION_FAILED");
    expect(result.statusCode).toBe(412);
    expect(result.message).toBe("etag mismatch");
  });

  it("maps 429 to TooManyRequestsError and propagates retryAfterInMs", () => {
    const error = Object.assign(new Error("throttled"), {
      code: 429,
      retryAfterInMs: 3000,
    });
    const result = mapCosmosError(error);

    expect(result).toBeInstanceOf(TooManyRequestsError);
    expect(result.code).toBe("TOO_MANY_REQUESTS");
    expect(result.statusCode).toBe(429);
    expect(result.message).toBe("throttled");
    expect((result as TooManyRequestsError).retryAfterMs).toBe(3000);
  });

  it("maps 429 without retryAfterInMs to TooManyRequestsError with undefined retryAfterMs", () => {
    const error = Object.assign(new Error("throttled"), { code: 429 });
    const result = mapCosmosError(error);

    expect(result).toBeInstanceOf(TooManyRequestsError);
    expect((result as TooManyRequestsError).retryAfterMs).toBeUndefined();
  });

  it("maps unknown status code to generic CosmioError with COSMOS_ERROR code", () => {
    const error = Object.assign(new Error("server error"), { code: 500 });
    const result = mapCosmosError(error);

    expect(result).toBeInstanceOf(CosmioError);
    expect(result.code).toBe("COSMOS_ERROR");
    expect(result.statusCode).toBe(500);
    expect(result.message).toBe("server error");
  });

  it("passes through an existing CosmioError unchanged", () => {
    const original = new ConflictError("already exists");
    const result = mapCosmosError(original);

    expect(result).toBe(original);
  });

  it("parses string status code ('409') correctly", () => {
    const error = Object.assign(new Error("conflict"), { code: "409" });
    const result = mapCosmosError(error);

    expect(result).toBeInstanceOf(ConflictError);
    expect(result.code).toBe("CONFLICT");
    expect(result.statusCode).toBe(409);
  });

  it("handles non-Error object with code property", () => {
    const error = { code: 404, message: "not an Error instance" };
    const result = mapCosmosError(error);

    expect(result).toBeInstanceOf(NotFoundError);
    expect(result.message).toBe("Unknown Cosmos DB error");
  });

  it("handles non-Error object without recognisable status code", () => {
    const error = { foo: "bar" };
    const result = mapCosmosError(error);

    expect(result).toBeInstanceOf(CosmioError);
    expect(result.code).toBe("COSMOS_ERROR");
    expect(result.statusCode).toBeUndefined();
    expect(result.message).toBe("Unknown Cosmos DB error");
  });

  it("reads statusCode property when code is absent", () => {
    const error = Object.assign(new Error("not found"), { statusCode: 404 });
    const result = mapCosmosError(error);

    expect(result).toBeInstanceOf(NotFoundError);
  });
});
