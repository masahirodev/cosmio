import type { Container, JSONObject, PatchRequestBody } from "@azure/cosmos";
import { mapCosmosError } from "../errors/index.js";

/**
 * Transactional batch builder for same-partition atomic operations.
 * All operations within a transaction must target the same partition key.
 */
export class TransactionBuilder {
  private readonly _container: Container;
  private readonly _partitionKey: unknown;
  private readonly _operations: unknown[] = [];

  constructor(container: Container, partitionKey: unknown) {
    this._container = container;
    this._partitionKey = partitionKey;
  }

  create(body: JSONObject): this {
    this._operations.push({ operationType: "Create", resourceBody: body });
    return this;
  }

  upsert(body: JSONObject): this {
    this._operations.push({ operationType: "Upsert", resourceBody: body });
    return this;
  }

  replace(id: string, body: JSONObject): this {
    this._operations.push({ operationType: "Replace", id, resourceBody: body });
    return this;
  }

  delete(id: string): this {
    this._operations.push({ operationType: "Delete", id });
    return this;
  }

  patch(id: string, operations: PatchRequestBody): this {
    this._operations.push({
      operationType: "Patch",
      id,
      resourceBody: operations,
    });
    return this;
  }

  /**
   * Execute all operations atomically.
   */
  async execute(): Promise<void> {
    let response: { result?: { statusCode: number }[] };
    try {
      response = await this._container.items.batch(
        this._operations as Parameters<Container["items"]["batch"]>[0],
        this._partitionKey as Parameters<Container["items"]["batch"]>[1],
      );
    } catch (error) {
      throw mapCosmosError(error);
    }
    // Check for partial failures outside catch to avoid double-wrapping
    if (response.result) {
      for (const op of response.result) {
        if (op.statusCode >= 400) {
          throw mapCosmosError({
            code: op.statusCode,
            message: `Batch operation failed with status ${op.statusCode}`,
          });
        }
      }
    }
  }
}
