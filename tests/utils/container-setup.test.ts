import type { Database } from "@azure/cosmos";
import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { ModelDefinition } from "../../src/model/model-types.js";
import { ensureContainer, ensureContainers } from "../../src/utils/container-setup.js";

type AnyModel = ModelDefinition<z.ZodObject<z.ZodRawShape>, readonly [string, ...string[]]>;

/** Create a minimal mock Database */
function mockDatabase() {
  return {
    containers: {
      createIfNotExists: vi.fn().mockResolvedValue({}),
    },
  } as unknown as Database;
}

/** Create a minimal model stub for testing */
function makeModel(overrides: Partial<AnyModel> & { name: string; container: string }): AnyModel {
  return {
    partitionKey: ["/id"] as const,
    schema: {} as AnyModel["schema"],
    defaults: {} as AnyModel["defaults"],
    validateOnRead: false,
    ...overrides,
  } as unknown as AnyModel;
}

describe("ensureContainer", () => {
  it("calls createIfNotExists with the container definition", async () => {
    const db = mockDatabase();
    const model = makeModel({ name: "User", container: "users" });

    await ensureContainer(db, model);

    expect(db.containers.createIfNotExists).toHaveBeenCalledTimes(1);
    expect(db.containers.createIfNotExists).toHaveBeenCalledWith(
      expect.objectContaining({ id: "users" }),
      expect.any(Object),
    );
  });
});

describe("ensureContainers", () => {
  it("throws when models share a container with different partitionKey", async () => {
    const db = mockDatabase();
    const modelA = makeModel({
      name: "ModelA",
      container: "shared",
      partitionKey: ["/id"] as const,
    });
    const modelB = makeModel({
      name: "ModelB",
      container: "shared",
      partitionKey: ["/tenantId"] as const,
    });

    await expect(ensureContainers(db, [modelA, modelB])).rejects.toThrow("partitionKey");
  });

  it("throws when models share a container with different defaultTtl", async () => {
    const db = mockDatabase();
    const modelA = makeModel({ name: "ModelA", container: "shared", defaultTtl: 3600 });
    const modelB = makeModel({ name: "ModelB", container: "shared", defaultTtl: 7200 });

    await expect(ensureContainers(db, [modelA, modelB])).rejects.toThrow("defaultTtl");
  });

  it("does not throw when models share a container with identical settings", async () => {
    const db = mockDatabase();
    const modelA = makeModel({
      name: "ModelA",
      container: "shared",
      partitionKey: ["/id"] as const,
      defaultTtl: 3600,
    });
    const modelB = makeModel({
      name: "ModelB",
      container: "shared",
      partitionKey: ["/id"] as const,
      defaultTtl: 3600,
    });

    await ensureContainers(db, [modelA, modelB]);
    // Only one createIfNotExists call since the second model is deduplicated
    expect(db.containers.createIfNotExists).toHaveBeenCalledTimes(1);
  });

  it("includes conflicting setting names in the error message", async () => {
    const db = mockDatabase();
    const modelA = makeModel({
      name: "ModelA",
      container: "shared",
      partitionKey: ["/id"] as const,
      defaultTtl: 100,
    });
    const modelB = makeModel({
      name: "ModelB",
      container: "shared",
      partitionKey: ["/tenantId"] as const,
      defaultTtl: 200,
    });

    await expect(ensureContainers(db, [modelA, modelB])).rejects.toThrow(
      /partitionKey.*defaultTtl|defaultTtl.*partitionKey/,
    );
  });
});
