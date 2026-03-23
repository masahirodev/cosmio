import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";

describe("defineModel", () => {
  it("creates a frozen model definition", () => {
    const model = defineModel({
      name: "User",
      container: "users",
      partitionKey: ["/tenantId"],
      schema: z.object({
        id: z.string(),
        tenantId: z.string(),
        name: z.string(),
      }),
    });

    expect(model.name).toBe("User");
    expect(model.container).toBe("users");
    expect(model.partitionKey).toEqual(["/tenantId"]);
    expect(Object.isFrozen(model)).toBe(true);
  });

  it("accepts hierarchical partition keys", () => {
    const model = defineModel({
      name: "Inspection",
      container: "inspections",
      partitionKey: ["/tenantId", "/siteId"],
      schema: z.object({
        id: z.string(),
        tenantId: z.string(),
        siteId: z.string(),
      }),
    });

    expect(model.partitionKey).toEqual(["/tenantId", "/siteId"]);
  });

  it("accepts discriminator config", () => {
    const model = defineModel({
      name: "Inspection",
      container: "documents",
      partitionKey: ["/tenantId"],
      discriminator: { field: "type", value: "inspection" },
      schema: z.object({
        id: z.string(),
        tenantId: z.string(),
        type: z.literal("inspection"),
      }),
    });

    expect(model.discriminator).toEqual({
      field: "type",
      value: "inspection",
    });
  });

  it("accepts optional description and indexingPolicy", () => {
    const model = defineModel({
      name: "User",
      container: "users",
      partitionKey: ["/tenantId"],
      schema: z.object({
        id: z.string(),
        tenantId: z.string(),
      }),
      description: "User documents",
      indexingPolicy: {
        includedPaths: [{ path: "/*" }],
        excludedPaths: [{ path: '/"_etag"/?' }],
      },
    });

    expect(model.description).toBe("User documents");
    expect(model.indexingPolicy?.includedPaths).toHaveLength(1);
  });

  it("throws if partition key path does not start with /", () => {
    expect(() =>
      defineModel({
        name: "Bad",
        container: "bad",
        partitionKey: ["tenantId"] as unknown as [string],
        schema: z.object({ id: z.string(), tenantId: z.string() }),
      }),
    ).toThrow('must start with "/"');
  });

  it("throws if discriminator field is not in schema", () => {
    expect(() =>
      defineModel({
        name: "Bad",
        container: "bad",
        partitionKey: ["/tenantId"],
        discriminator: { field: "kind", value: "test" },
        schema: z.object({ id: z.string(), tenantId: z.string() }),
      }),
    ).toThrow('Discriminator field "kind" is not defined in the schema');
  });

  it("accepts defaultTtl", () => {
    const model = defineModel({
      name: "Session",
      container: "sessions",
      partitionKey: ["/userId"],
      schema: z.object({ id: z.string(), userId: z.string() }),
      defaultTtl: 3600,
    });

    expect(model.defaultTtl).toBe(3600);
  });

  it("accepts defaultTtl of -1 (enabled without default expiry)", () => {
    const model = defineModel({
      name: "Log",
      container: "logs",
      partitionKey: ["/tenantId"],
      schema: z.object({ id: z.string(), tenantId: z.string(), ttl: z.number().optional() }),
      defaultTtl: -1,
    });

    expect(model.defaultTtl).toBe(-1);
  });

  it("accepts uniqueKeyPolicy", () => {
    const model = defineModel({
      name: "User",
      container: "users",
      partitionKey: ["/tenantId"],
      schema: z.object({
        id: z.string(),
        tenantId: z.string(),
        email: z.string(),
        username: z.string(),
      }),
      uniqueKeyPolicy: {
        uniqueKeys: [{ paths: ["/email"] }, { paths: ["/username"] }],
      },
    });

    expect(model.uniqueKeyPolicy?.uniqueKeys).toHaveLength(2);
  });

  it("accepts defaults with static values", () => {
    const model = defineModel({
      name: "Doc",
      container: "docs",
      partitionKey: ["/tenantId"],
      schema: z.object({
        id: z.string(),
        tenantId: z.string(),
        type: z.literal("doc"),
        status: z.string(),
      }),
      defaults: {
        type: "doc",
        status: "draft",
      },
    });

    expect(model.defaults).toEqual({ type: "doc", status: "draft" });
  });

  it("accepts defaults with factory functions", () => {
    const model = defineModel({
      name: "Doc",
      container: "docs",
      partitionKey: ["/tenantId"],
      schema: z.object({
        id: z.string(),
        tenantId: z.string(),
        createdAt: z.string(),
      }),
      defaults: {
        createdAt: () => "2025-01-01T00:00:00Z",
      },
    });

    const factory = model.defaults.createdAt;
    expect(typeof factory).toBe("function");
    expect((factory as () => string)()).toBe("2025-01-01T00:00:00Z");
  });

  it("throws if defaults key is not in schema", () => {
    expect(() =>
      defineModel({
        name: "Bad",
        container: "bad",
        partitionKey: ["/tenantId"],
        schema: z.object({ id: z.string(), tenantId: z.string() }),
        defaults: { nonExistent: "value" } as never,
      }),
    ).toThrow('Default key "nonExistent" is not defined in the schema');
  });

  it("defaults is empty object when not specified", () => {
    const model = defineModel({
      name: "Simple",
      container: "simple",
      partitionKey: ["/tenantId"],
      schema: z.object({ id: z.string(), tenantId: z.string() }),
    });

    expect(model.defaults).toEqual({});
  });

  it("accepts conflictResolutionPolicy", () => {
    const model = defineModel({
      name: "Doc",
      container: "docs",
      partitionKey: ["/tenantId"],
      schema: z.object({ id: z.string(), tenantId: z.string(), updatedAt: z.number() }),
      conflictResolutionPolicy: {
        mode: "LastWriterWins",
        conflictResolutionPath: "/updatedAt",
      },
    });

    expect(model.conflictResolutionPolicy?.mode).toBe("LastWriterWins");
  });
});
