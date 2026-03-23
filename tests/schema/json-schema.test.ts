import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { toJsonSchema, toJsonSchemas } from "../../src/schema/json-schema.js";

const UserModel = defineModel({
  name: "User",
  container: "users",
  partitionKey: ["/tenantId"],
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    name: z.string(),
    age: z.number().optional(),
  }),
  description: "A user document",
});

describe("toJsonSchema", () => {
  it("generates valid JSON Schema with cosmio extensions", () => {
    const schema = toJsonSchema(UserModel);

    expect(schema.$schema).toContain("json-schema.org");
    expect(schema.title).toBe("User");
    expect(schema.description).toBe("A user document");
    expect(schema["x-cosmio-container"]).toBe("users");
    expect(schema["x-cosmio-partition-key"]).toEqual(["/tenantId"]);
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
  });

  it("includes field definitions", () => {
    const schema = toJsonSchema(UserModel);
    const props = schema.properties as Record<string, { type?: string }>;

    expect(props.id).toBeDefined();
    expect(props.tenantId).toBeDefined();
    expect(props.name).toBeDefined();
  });

  it("marks required fields", () => {
    const schema = toJsonSchema(UserModel);
    const required = schema.required as string[];

    expect(required).toContain("id");
    expect(required).toContain("tenantId");
    expect(required).toContain("name");
    expect(required).not.toContain("age");
  });

  it("includes discriminator extension when present", () => {
    const model = defineModel({
      name: "TypedDoc",
      container: "docs",
      partitionKey: ["/tenantId"],
      discriminator: { field: "type", value: "typed" },
      schema: z.object({
        id: z.string(),
        tenantId: z.string(),
        type: z.literal("typed"),
      }),
    });

    const schema = toJsonSchema(model);
    expect(schema["x-cosmio-discriminator"]).toEqual({
      field: "type",
      value: "typed",
    });
  });
});

describe("toJsonSchemas", () => {
  it("generates schemas for multiple models", () => {
    const model2 = defineModel({
      name: "Post",
      container: "posts",
      partitionKey: ["/userId"],
      schema: z.object({
        id: z.string(),
        userId: z.string(),
        title: z.string(),
      }),
    });

    const schemas = toJsonSchemas([UserModel, model2]);
    expect(Object.keys(schemas)).toEqual(["User", "Post"]);
    expect(schemas.User?.title).toBe("User");
    expect(schemas.Post?.title).toBe("Post");
  });
});
