import { describe, expect, it } from "vitest";
import { generateModelSource, toPascalCase } from "../../src/introspect/codegen.js";
import type { InferredSchema } from "../../src/introspect/infer-schema.js";
import type { ContainerMetadata } from "../../src/introspect/sample.js";

/** Helper to build CodegenOptions with sensible defaults */
function makeOptions(
  overrides: {
    schema?: InferredSchema;
    modelName?: string;
    containerName?: string;
    partitionKeyPaths?: string[];
    metadata?: ContainerMetadata;
    includeIndexingPolicy?: boolean;
  } = {},
) {
  return {
    modelName: overrides.modelName ?? "Test",
    containerName: overrides.containerName ?? "tests",
    partitionKeyPaths: overrides.partitionKeyPaths ?? ["/id"],
    schema: overrides.schema ?? { fields: {}, possibleDiscriminators: [] },
    metadata: overrides.metadata ?? ({} as ContainerMetadata),
    includeIndexingPolicy: overrides.includeIndexingPolicy,
  };
}

describe("toPascalCase", () => {
  it('converts "users" to "User" (strips trailing s)', () => {
    expect(toPascalCase("users")).toBe("User");
  });

  it('converts "user-events" to "UserEvent"', () => {
    expect(toPascalCase("user-events")).toBe("UserEvent");
  });

  it('converts "orderItems" to "OrderItem"', () => {
    expect(toPascalCase("orderItems")).toBe("OrderItem");
  });

  it('converts "address" to "Address" (ends in ss — not stripped)', () => {
    expect(toPascalCase("address")).toBe("Address");
  });

  it('keeps "status" as "Status" (ends in ss — not stripped)', () => {
    expect(toPascalCase("status")).toBe("Status");
  });
});

describe("generateModelSource", () => {
  it("generates correct TypeScript for basic schema (string, number, optional, nullable)", () => {
    const schema: InferredSchema = {
      fields: {
        id: { type: { kind: "string" }, optional: false, nullable: false },
        name: { type: { kind: "string" }, optional: false, nullable: false },
        age: { type: { kind: "number" }, optional: true, nullable: false },
        bio: { type: { kind: "string" }, optional: false, nullable: true },
      },
      possibleDiscriminators: [],
    };
    const source = generateModelSource(
      makeOptions({ schema, modelName: "User", containerName: "users" }),
    );

    expect(source).toContain('import { z } from "zod";');
    expect(source).toContain('import { defineModel } from "cosmio";');
    expect(source).toContain("id: z.string(),");
    expect(source).toContain("name: z.string(),");
    expect(source).toContain("age: z.number().optional(),");
    expect(source).toContain("bio: z.string().nullable(),");
  });

  it("includes discriminator when possibleDiscriminators is non-empty", () => {
    const schema: InferredSchema = {
      fields: {
        id: { type: { kind: "string" }, optional: false, nullable: false },
        type: { type: { kind: "literal", value: "article" }, optional: false, nullable: false },
      },
      possibleDiscriminators: [{ field: "type", value: "article" }],
    };
    const source = generateModelSource(makeOptions({ schema }));

    expect(source).toContain('discriminator: { field: "type", value: "article" }');
  });

  it("generates z.enum([...]) for enum fields", () => {
    const schema: InferredSchema = {
      fields: {
        status: {
          type: { kind: "enum", values: ["active", "inactive", "pending"] },
          optional: false,
          nullable: false,
        },
      },
      possibleDiscriminators: [],
    };
    const source = generateModelSource(makeOptions({ schema }));

    expect(source).toContain('status: z.enum(["active", "inactive", "pending"]),');
  });

  it("generates z.literal(...) for literal fields", () => {
    const schema: InferredSchema = {
      fields: {
        type: {
          type: { kind: "literal", value: "order" },
          optional: false,
          nullable: false,
        },
        version: {
          type: { kind: "literal", value: 2 },
          optional: false,
          nullable: false,
        },
      },
      possibleDiscriminators: [],
    };
    const source = generateModelSource(makeOptions({ schema }));

    expect(source).toContain('type: z.literal("order"),');
    expect(source).toContain("version: z.literal(2),");
  });

  it("generates z.object({...}) for nested object fields", () => {
    const schema: InferredSchema = {
      fields: {
        address: {
          type: {
            kind: "object",
            fields: {
              city: { type: { kind: "string" }, optional: false, nullable: false },
              zip: { type: { kind: "string" }, optional: false, nullable: false },
            },
          },
          optional: false,
          nullable: false,
        },
      },
      possibleDiscriminators: [],
    };
    const source = generateModelSource(makeOptions({ schema }));

    expect(source).toContain("address: z.object({");
    expect(source).toContain("city: z.string(),");
    expect(source).toContain("zip: z.string(),");
  });

  it("generates z.array(...) for array fields", () => {
    const schema: InferredSchema = {
      fields: {
        tags: {
          type: { kind: "array", element: { kind: "string" } },
          optional: false,
          nullable: false,
        },
      },
      possibleDiscriminators: [],
    };
    const source = generateModelSource(makeOptions({ schema }));

    expect(source).toContain("tags: z.array(z.string()),");
  });
});
