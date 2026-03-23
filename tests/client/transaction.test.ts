import { describe, expect, it, vi } from "vitest";
import { TransactionBuilder } from "../../src/client/transaction.js";
import { CosmioError, ConflictError, TooManyRequestsError } from "../../src/errors/index.js";

function mockContainer(batchFn: ReturnType<typeof vi.fn>) {
  return {
    items: {
      batch: batchFn,
    },
  } as never;
}

describe("TransactionBuilder", () => {
  describe("operation types", () => {
    it("create sets operationType to Create", () => {
      const batch = vi.fn().mockResolvedValue({ result: [{ statusCode: 200 }] });
      const tx = new TransactionBuilder(mockContainer(batch), "pk1");

      tx.create({ id: "1", value: "a" });

      // Execute to trigger batch call so we can inspect
      void tx.execute();

      const ops = batch.mock.calls[0]![0];
      expect(ops).toHaveLength(1);
      expect(ops[0]).toEqual({ operationType: "Create", resourceBody: { id: "1", value: "a" } });
    });

    it("upsert sets operationType to Upsert", () => {
      const batch = vi.fn().mockResolvedValue({ result: [{ statusCode: 200 }] });
      const tx = new TransactionBuilder(mockContainer(batch), "pk1");

      tx.upsert({ id: "1", value: "a" });
      void tx.execute();

      const ops = batch.mock.calls[0]![0];
      expect(ops[0]).toEqual({ operationType: "Upsert", resourceBody: { id: "1", value: "a" } });
    });

    it("replace sets operationType to Replace with id", () => {
      const batch = vi.fn().mockResolvedValue({ result: [{ statusCode: 200 }] });
      const tx = new TransactionBuilder(mockContainer(batch), "pk1");

      tx.replace("doc1", { id: "doc1", value: "b" });
      void tx.execute();

      const ops = batch.mock.calls[0]![0];
      expect(ops[0]).toEqual({
        operationType: "Replace",
        id: "doc1",
        resourceBody: { id: "doc1", value: "b" },
      });
    });

    it("delete sets operationType to Delete with id", () => {
      const batch = vi.fn().mockResolvedValue({ result: [{ statusCode: 204 }] });
      const tx = new TransactionBuilder(mockContainer(batch), "pk1");

      tx.delete("doc1");
      void tx.execute();

      const ops = batch.mock.calls[0]![0];
      expect(ops[0]).toEqual({ operationType: "Delete", id: "doc1" });
    });

    it("patch sets operationType to Patch with id and operations", () => {
      const batch = vi.fn().mockResolvedValue({ result: [{ statusCode: 200 }] });
      const tx = new TransactionBuilder(mockContainer(batch), "pk1");

      const patchOps = { operations: [{ op: "add", path: "/foo", value: "bar" }] };
      tx.patch("doc1", patchOps as never);
      void tx.execute();

      const ops = batch.mock.calls[0]![0];
      expect(ops[0]).toEqual({
        operationType: "Patch",
        id: "doc1",
        resourceBody: patchOps,
      });
    });

    it("passes partition key to batch", () => {
      const batch = vi.fn().mockResolvedValue({ result: [{ statusCode: 200 }] });
      const tx = new TransactionBuilder(mockContainer(batch), "tenant-abc");

      tx.create({ id: "1" });
      void tx.execute();

      expect(batch.mock.calls[0]![1]).toBe("tenant-abc");
    });

    it("supports method chaining", () => {
      const batch = vi
        .fn()
        .mockResolvedValue({ result: [{ statusCode: 200 }, { statusCode: 200 }] });
      const tx = new TransactionBuilder(mockContainer(batch), "pk1");

      const result = tx.create({ id: "1" }).upsert({ id: "2" });
      expect(result).toBe(tx);
    });
  });

  describe("execute() - partial failure", () => {
    it("throws ConflictError when a result has statusCode 409", async () => {
      const batch = vi.fn().mockResolvedValue({
        result: [{ statusCode: 200 }, { statusCode: 409 }],
      });
      const tx = new TransactionBuilder(mockContainer(batch), "pk1");
      tx.create({ id: "1" }).create({ id: "2" });

      await expect(tx.execute()).rejects.toThrow(ConflictError);
    });

    it("throws TooManyRequestsError when a result has statusCode 429", async () => {
      const batch = vi.fn().mockResolvedValue({
        result: [{ statusCode: 429 }],
      });
      const tx = new TransactionBuilder(mockContainer(batch), "pk1");
      tx.create({ id: "1" });

      await expect(tx.execute()).rejects.toThrow(TooManyRequestsError);
    });

    it("throws CosmioError for statusCode >= 400", async () => {
      const batch = vi.fn().mockResolvedValue({
        result: [{ statusCode: 200 }, { statusCode: 400 }],
      });
      const tx = new TransactionBuilder(mockContainer(batch), "pk1");
      tx.create({ id: "1" }).create({ id: "2" });

      await expect(tx.execute()).rejects.toThrow(CosmioError);
    });

    it("detects first failing operation in result set", async () => {
      const batch = vi.fn().mockResolvedValue({
        result: [{ statusCode: 200 }, { statusCode: 409 }, { statusCode: 429 }],
      });
      const tx = new TransactionBuilder(mockContainer(batch), "pk1");
      tx.create({ id: "1" }).create({ id: "2" }).create({ id: "3" });

      // Should throw for the first failure (409), not the second (429)
      await expect(tx.execute()).rejects.toThrow(ConflictError);
    });
  });

  describe("execute() - batch throws", () => {
    it("wraps thrown error with mapCosmosError", async () => {
      const batch = vi.fn().mockRejectedValue({ code: 409, message: "Conflict from SDK" });
      const tx = new TransactionBuilder(mockContainer(batch), "pk1");
      tx.create({ id: "1" });

      await expect(tx.execute()).rejects.toThrow(ConflictError);
    });

    it("wraps unknown errors as CosmioError", async () => {
      const batch = vi.fn().mockRejectedValue(new Error("network failure"));
      const tx = new TransactionBuilder(mockContainer(batch), "pk1");
      tx.create({ id: "1" });

      await expect(tx.execute()).rejects.toThrow(CosmioError);
      await expect(tx.execute()).rejects.toThrow("network failure");
    });
  });

  describe("execute() - all success", () => {
    it("resolves without error when all statusCodes are < 400", async () => {
      const batch = vi.fn().mockResolvedValue({
        result: [{ statusCode: 200 }, { statusCode: 201 }, { statusCode: 204 }],
      });
      const tx = new TransactionBuilder(mockContainer(batch), "pk1");
      tx.create({ id: "1" }).upsert({ id: "2" }).delete("3");

      await expect(tx.execute()).resolves.toBeUndefined();
    });

    it("resolves when result is undefined", async () => {
      const batch = vi.fn().mockResolvedValue({});
      const tx = new TransactionBuilder(mockContainer(batch), "pk1");
      tx.create({ id: "1" });

      await expect(tx.execute()).resolves.toBeUndefined();
    });
  });
});
