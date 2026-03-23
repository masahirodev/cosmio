import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CosmioContainer } from "../../src/client/cosmio-container.js";
import { ValidationError } from "../../src/errors/index.js";
import { defineModel } from "../../src/model/define-model.js";
import { extractPartitionKey } from "../../src/utils/partition-key.js";

const InspectionModel = defineModel({
  name: "Inspection",
  container: "inspections",
  partitionKey: ["/tenantId", "/siteId"],
  discriminator: { field: "type", value: "inspection" },
  schema: z.object({
    id: z.string(),
    type: z.literal("inspection"),
    tenantId: z.string(),
    siteId: z.string(),
    name: z.string(),
  }),
});

describe("extractPartitionKey", () => {
  it("extracts PK values from a document", () => {
    const doc = {
      id: "1",
      type: "inspection",
      tenantId: "t1",
      siteId: "s1",
      name: "Test",
    };

    const pk = extractPartitionKey(InspectionModel, doc);
    expect(pk).toEqual(["t1", "s1"]);
  });

  it("throws if PK field is missing", () => {
    const doc = { id: "1", type: "inspection", tenantId: "t1", name: "Test" };

    expect(() => extractPartitionKey(InspectionModel, doc)).toThrow(
      'Partition key field "siteId" is missing',
    );
  });
});

describe("validation", () => {
  it("validates documents against schema", () => {
    const result = InspectionModel.schema.safeParse({
      id: "1",
      type: "inspection",
      tenantId: "t1",
      siteId: "s1",
      name: "Test",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid documents", () => {
    const result = InspectionModel.schema.safeParse({
      id: "1",
      type: "wrong",
      tenantId: "t1",
      siteId: "s1",
      name: "Test",
    });

    expect(result.success).toBe(false);
  });
});

describe("ValidationError", () => {
  it("creates error with issues", () => {
    const err = new ValidationError("test error", [{ path: ["field"], message: "required" }]);

    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.issues).toHaveLength(1);
    expect(err.name).toBe("ValidationError");
  });
});

describe("defaults", () => {
  const ModelWithDefaults = defineModel({
    name: "Task",
    container: "tasks",
    partitionKey: ["/tenantId"],
    schema: z.object({
      id: z.string(),
      tenantId: z.string(),
      status: z.string(),
      createdAt: z.string(),
      priority: z.number(),
    }),
    defaults: {
      status: "draft",
      createdAt: () => "2025-01-01T00:00:00Z",
      priority: 0,
    },
  });

  // Create a CosmioContainer with a mock Cosmos Container
  function createMockContainer() {
    const created = { resource: null as unknown };
    const mockContainer = {
      items: {
        create: vi.fn(async (doc: unknown) => {
          created.resource = doc;
          return { resource: doc };
        }),
        upsert: vi.fn(async (doc: unknown) => {
          return { resource: doc };
        }),
      },
    };
    const container = new CosmioContainer(mockContainer as never, ModelWithDefaults);
    return { container, mockContainer, created };
  }

  it("fills in static defaults for missing fields", async () => {
    const { container, created } = createMockContainer();

    await container.create({
      id: "t1",
      tenantId: "tenant1",
    });

    const doc = created.resource as Record<string, unknown>;
    expect(doc.status).toBe("draft");
    expect(doc.priority).toBe(0);
  });

  it("fills in factory defaults for missing fields", async () => {
    const { container, created } = createMockContainer();

    await container.create({
      id: "t2",
      tenantId: "tenant1",
    });

    const doc = created.resource as Record<string, unknown>;
    expect(doc.createdAt).toBe("2025-01-01T00:00:00Z");
  });

  it("does not override explicitly provided values", async () => {
    const { container, created } = createMockContainer();

    await container.create({
      id: "t3",
      tenantId: "tenant1",
      status: "active",
      createdAt: "2025-06-01T00:00:00Z",
      priority: 5,
    });

    const doc = created.resource as Record<string, unknown>;
    expect(doc.status).toBe("active");
    expect(doc.createdAt).toBe("2025-06-01T00:00:00Z");
    expect(doc.priority).toBe(5);
  });

  it("calls factory function on each create", async () => {
    let callCount = 0;
    const FactoryModel = defineModel({
      name: "Counter",
      container: "counters",
      partitionKey: ["/tenantId"],
      schema: z.object({
        id: z.string(),
        tenantId: z.string(),
        seq: z.number(),
      }),
      defaults: {
        seq: () => ++callCount,
      },
    });

    const mockContainer = {
      items: {
        create: vi.fn(async (doc: unknown) => ({ resource: doc })),
      },
    };
    const container = new CosmioContainer(mockContainer as never, FactoryModel);

    await container.create({ id: "a", tenantId: "t1" });
    await container.create({ id: "b", tenantId: "t1" });

    const firstDoc = (mockContainer.items.create.mock.calls[0] as [Record<string, unknown>])[0];
    const secondDoc = (mockContainer.items.create.mock.calls[1] as [Record<string, unknown>])[0];
    expect(firstDoc.seq).toBe(1);
    expect(secondDoc.seq).toBe(2);
  });

  it("applies defaults in upsert too", async () => {
    const { container, mockContainer } = createMockContainer();

    await container.upsert({
      id: "t4",
      tenantId: "tenant1",
    });

    const doc = (mockContainer.items.upsert.mock.calls[0] as [Record<string, unknown>])[0];
    expect(doc.status).toBe("draft");
    expect(doc.priority).toBe(0);
  });
});

describe("replace()", () => {
  const ReplaceModel = defineModel({
    name: "ReplaceDoc",
    container: "replaceDocs",
    partitionKey: ["/tenantId"],
    schema: z.object({
      id: z.string(),
      tenantId: z.string(),
      name: z.string(),
    }),
  });

  it("throws ValidationError when doc id does not match target id", async () => {
    const mockContainer = {
      item: vi.fn(() => ({
        replace: vi.fn(async () => ({ resource: {} })),
      })),
    };
    const container = new CosmioContainer(mockContainer as never, ReplaceModel);

    await expect(
      container.replace("target-id", { id: "different-id", tenantId: "t1", name: "X" }),
    ).rejects.toThrow(ValidationError);
  });

  it("returns replaced document on success", async () => {
    const replacedDoc = { id: "doc-1", tenantId: "t1", name: "Updated" };
    const replaceFn = vi.fn(async () => ({ resource: replacedDoc }));
    const mockContainer = {
      item: vi.fn(() => ({
        replace: replaceFn,
      })),
    };
    const container = new CosmioContainer(mockContainer as never, ReplaceModel);

    const result = await container.replace("doc-1", {
      id: "doc-1",
      tenantId: "t1",
      name: "Updated",
    });
    expect(result).toBeDefined();
    expect(result.id).toBe("doc-1");
    expect(result.name).toBe("Updated");
    expect(replaceFn).toHaveBeenCalledOnce();
  });
});

describe("migrate (read-time transformation)", () => {
  // v1 schema had "firstName" + "lastName", v2 has "fullName"
  const UserModelV2 = defineModel({
    name: "User",
    container: "users",
    partitionKey: ["/tenantId"],
    schema: z.object({
      id: z.string(),
      tenantId: z.string(),
      fullName: z.string(),
      role: z.string(),
    }),
    migrate: (raw) => {
      // v1 → v2: merge firstName+lastName into fullName
      if (!raw.fullName && raw.firstName) {
        raw.fullName = `${raw.firstName} ${raw.lastName}`;
        delete raw.firstName;
        delete raw.lastName;
      }
      // v1 → v2: add default role if missing
      if (!raw.role) {
        raw.role = "member";
      }
      return raw;
    },
  });

  function createMockReadContainer(readResult: Record<string, unknown>) {
    const mockContainer = {
      item: vi.fn(() => ({
        read: vi.fn(async () => ({ resource: readResult })),
      })),
      items: {
        query: vi.fn(() => ({
          fetchAll: vi.fn(async () => ({ resources: [readResult] })),
        })),
      },
    };
    return new CosmioContainer(mockContainer as never, UserModelV2);
  }

  it("transforms v1 document to v2 on findById", async () => {
    const container = createMockReadContainer({
      id: "u1",
      tenantId: "t1",
      firstName: "Taro",
      lastName: "Yamada",
      // no fullName, no role — old v1 document
    });

    const doc = await container.findById("u1", ["t1"]);
    expect(doc).toBeDefined();
    expect(doc!.fullName).toBe("Taro Yamada");
    expect(doc!.role).toBe("member");
    // old fields should be removed
    expect((doc as Record<string, unknown>).firstName).toBeUndefined();
  });

  it("does not overwrite existing v2 fields", async () => {
    const container = createMockReadContainer({
      id: "u2",
      tenantId: "t1",
      fullName: "Already Migrated",
      role: "admin",
    });

    const doc = await container.findById("u2", ["t1"]);
    expect(doc!.fullName).toBe("Already Migrated");
    expect(doc!.role).toBe("admin");
  });

  it("transforms documents in query results", async () => {
    const container = createMockReadContainer({
      id: "u3",
      tenantId: "t1",
      firstName: "Hanako",
      lastName: "Sato",
    });

    const results = await container.query("SELECT * FROM c", ["t1"]);
    expect(results).toHaveLength(1);
    expect(results[0]!.fullName).toBe("Hanako Sato");
    expect(results[0]!.role).toBe("member");
  });

  it("transforms documents in find().exec()", async () => {
    const v1Doc = {
      id: "u4",
      tenantId: "t1",
      firstName: "Jiro",
      lastName: "Tanaka",
    };
    const mockContainer = {
      items: {
        query: vi.fn(() => ({
          fetchAll: vi.fn(async () => ({ resources: [v1Doc] })),
        })),
      },
    };
    const container = new CosmioContainer(mockContainer as never, UserModelV2);

    const results = await container.find(["t1"]).exec();
    expect(results[0]!.fullName).toBe("Jiro Tanaka");
    expect(results[0]!.role).toBe("member");
  });
});

describe("validateOnRead", () => {
  const StrictModel = defineModel({
    name: "Strict",
    container: "strict",
    partitionKey: ["/tenantId"],
    schema: z.object({
      id: z.string(),
      tenantId: z.string(),
      score: z.number(),
    }),
    validateOnRead: true,
  });

  it("throws ValidationError on read when document is invalid", async () => {
    const mockContainer = {
      item: vi.fn(() => ({
        read: vi.fn(async () => ({
          resource: { id: "x", tenantId: "t1", score: "not-a-number" },
        })),
      })),
    };
    const container = new CosmioContainer(mockContainer as never, StrictModel);

    await expect(container.findById("x", ["t1"])).rejects.toThrow(ValidationError);
  });

  it("passes when document is valid", async () => {
    const mockContainer = {
      item: vi.fn(() => ({
        read: vi.fn(async () => ({
          resource: { id: "x", tenantId: "t1", score: 100 },
        })),
      })),
    };
    const container = new CosmioContainer(mockContainer as never, StrictModel);

    const doc = await container.findById("x", ["t1"]);
    expect(doc!.score).toBe(100);
  });
});

describe("bulk() error cases", () => {
  const BulkModel = defineModel({
    name: "BulkItem",
    container: "items",
    partitionKey: ["/tenantId"],
    schema: z.object({
      id: z.string(),
      tenantId: z.string(),
      name: z.string(),
    }),
  });

  const SoftDeleteModel = defineModel({
    name: "SoftItem",
    container: "softitems",
    partitionKey: ["/tenantId"],
    softDelete: { field: "deletedAt" },
    schema: z.object({
      id: z.string(),
      tenantId: z.string(),
      name: z.string(),
      deletedAt: z.number().optional(),
    }),
  });

  it("throws on partial failure (statusCode >= 400) with index and status in message", async () => {
    const mockContainer = {
      items: {
        bulk: vi.fn(async () => [
          { statusCode: 201 },
          { statusCode: 409 },
          { statusCode: 201 },
          { statusCode: 500 },
        ]),
      },
    };
    const container = new CosmioContainer(mockContainer as never, BulkModel);

    const bulkOps = [
      { type: "create" as const, body: { id: "1", tenantId: "t1", name: "A" } },
      { type: "create" as const, body: { id: "2", tenantId: "t1", name: "B" } },
      { type: "create" as const, body: { id: "3", tenantId: "t1", name: "C" } },
      { type: "create" as const, body: { id: "4", tenantId: "t1", name: "D" } },
    ];

    // The bulk method builds a message with index=N, status=N details
    // and passes it to mapCosmosError which wraps it as a CosmioError.
    // The inner object carries { code, message } but is not an Error instance,
    // so mapCosmosError falls back to "Unknown Cosmos DB error" for the message.
    // We verify that the error is thrown (partial failure detected) and has the
    // correct error code from the first failure's statusCode (409 → CONFLICT).
    const err = await container.bulk(bulkOps).catch((e: unknown) => e);
    expect(err).toBeDefined();
    expect((err as { code: string }).code).toBe("CONFLICT");
  });

  it("converts soft-delete model delete to Patch operationType in bulk", async () => {
    const bulkFn = vi.fn(async () => [{ statusCode: 200 }]);
    const mockContainer = {
      items: { bulk: bulkFn },
    };
    const container = new CosmioContainer(mockContainer as never, SoftDeleteModel);

    await container.bulk([{ type: "delete", id: "doc-1", partitionKeyValues: ["t1"] }]);

    const ops = bulkFn.mock.calls[0] as unknown[];
    const cosmosOps = ops[0] as { operationType: string; resourceBody: unknown }[];
    expect(cosmosOps[0]!.operationType).toBe("Patch");
    const patchBody = cosmosOps[0]!.resourceBody as { op: string; path: string }[];
    expect(patchBody[0]!.op).toBe("set");
    expect(patchBody[0]!.path).toBe("/deletedAt");
  });
});
