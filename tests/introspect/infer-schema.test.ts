import { describe, expect, it } from "vitest";
import type { InferredField, InferredSchema } from "../../src/introspect/infer-schema.js";
import { inferSchema } from "../../src/introspect/infer-schema.js";

/** Get a field from inferred schema, asserting it exists */
function f(schema: InferredSchema, name: string): InferredField {
  const field = schema.fields[name];
  if (!field) throw new Error(`Field "${name}" not found in schema`);
  return field;
}

describe("inferSchema", () => {
  it("infers basic string/number/boolean fields", () => {
    const docs = [
      { id: "1", name: "Alice", age: 30, active: true },
      { id: "2", name: "Bob", age: 25, active: false },
    ];
    const result = inferSchema(docs);

    expect(f(result, "id").type.kind).toBe("enum");
    expect(f(result, "name").type.kind).toBe("enum");
    expect(f(result, "age").type.kind).toBe("enum");
    expect(f(result, "active").type.kind).toBe("boolean");
    expect(f(result, "active").optional).toBe(false);
    expect(f(result, "active").nullable).toBe(false);
  });

  it("detects optional fields", () => {
    const docs = [
      { id: "1", name: "Alice", bio: "hello" },
      { id: "2", name: "Bob" },
    ];
    const result = inferSchema(docs);

    expect(f(result, "name").optional).toBe(false);
    expect(f(result, "bio").optional).toBe(true);
  });

  it("detects nullable fields", () => {
    const docs = [
      { id: "1", name: "Alice" },
      { id: "2", name: null },
    ];
    const result = inferSchema(docs);

    expect(f(result, "name").nullable).toBe(true);
  });

  it("detects literal (single distinct value) as discriminator", () => {
    const docs = [
      { id: "1", type: "article", title: "A" },
      { id: "2", type: "article", title: "B" },
      { id: "3", type: "article", title: "C" },
    ];
    const result = inferSchema(docs);

    expect(f(result, "type").type).toEqual({ kind: "literal", value: "article" });
    expect(result.possibleDiscriminators).toEqual([{ field: "type", value: "article" }]);
  });

  it("detects enum for small set of distinct string values", () => {
    const docs = [
      { status: "active" },
      { status: "inactive" },
      { status: "active" },
      { status: "pending" },
    ];
    const result = inferSchema(docs);

    const status = f(result, "status");
    expect(status.type.kind).toBe("enum");
    if (status.type.kind === "enum") {
      expect(status.type.values).toEqual(["active", "inactive", "pending"]);
    }
  });

  it("falls back to string when distinct values exceed threshold", () => {
    const docs = Array.from({ length: 20 }, (_, i) => ({ name: `name-${i}` }));
    const result = inferSchema(docs, { enumThreshold: 5 });

    expect(f(result, "name").type.kind).toBe("string");
  });

  it("infers nested objects", () => {
    const docs = [
      { id: "1", address: { city: "Tokyo", zip: "100" } },
      { id: "2", address: { city: "Osaka", zip: "530" } },
    ];
    const result = inferSchema(docs);

    const addr = f(result, "address");
    expect(addr.type.kind).toBe("object");
    if (addr.type.kind === "object") {
      expect(addr.type.fields.city?.type.kind).toBe("enum");
      expect(addr.type.fields.zip?.type.kind).toBe("enum");
    }
  });

  it("infers arrays with homogeneous elements", () => {
    const docs = [{ tags: ["a", "b"] }, { tags: ["c"] }];
    const result = inferSchema(docs);

    const tags = f(result, "tags");
    expect(tags.type.kind).toBe("array");
    if (tags.type.kind === "array") {
      expect(tags.type.element.kind).toBe("enum");
    }
  });

  it("infers arrays with mixed element types as union", () => {
    const docs = [{ values: [1, "two", true] }];
    const result = inferSchema(docs);

    const values = f(result, "values");
    expect(values.type.kind).toBe("array");
    if (values.type.kind === "array") {
      expect(values.type.element.kind).toBe("union");
    }
  });

  it("handles empty arrays", () => {
    const docs = [{ tags: [] }, { tags: [] }];
    const result = inferSchema(docs);

    const tags = f(result, "tags");
    expect(tags.type.kind).toBe("array");
    if (tags.type.kind === "array") {
      expect(tags.type.element.kind).toBe("unknown");
    }
  });

  it("handles mixed types for same field as union", () => {
    const docs = [{ value: "hello" }, { value: 42 }];
    const result = inferSchema(docs);

    const value = f(result, "value");
    expect(value.type.kind).toBe("union");
    if (value.type.kind === "union") {
      const kinds = value.type.variants.map((v) => v.kind).sort();
      expect(kinds).toEqual(["number", "string"]);
    }
  });

  it("excludes Cosmos system fields", () => {
    const docs = [
      {
        id: "1",
        name: "Alice",
        _rid: "r1",
        _self: "s1",
        _ts: 123,
        _etag: "e1",
        _attachments: "a1",
      },
    ];
    const result = inferSchema(docs);

    expect(result.fields._rid).toBeUndefined();
    expect(result.fields._self).toBeUndefined();
    expect(result.fields._ts).toBeUndefined();
    expect(result.fields._etag).toBeUndefined();
    expect(result.fields._attachments).toBeUndefined();
    expect(result.fields.id).toBeDefined();
    expect(result.fields.name).toBeDefined();
  });

  it("returns empty schema for empty documents array", () => {
    const result = inferSchema([]);
    expect(result.fields).toEqual({});
    expect(result.possibleDiscriminators).toEqual([]);
  });

  it("handles field that is only null", () => {
    const docs = [
      { id: "1", deletedAt: null },
      { id: "2", deletedAt: null },
    ];
    const result = inferSchema(docs);

    expect(f(result, "deletedAt").nullable).toBe(true);
    expect(f(result, "deletedAt").type.kind).toBe("unknown");
  });

  it("respects maxDepth option", () => {
    const deepDoc = { level1: { level2: { level3: { value: "deep" } } } };
    const result = inferSchema([deepDoc], { maxDepth: 2 });

    const level1 = f(result, "level1");
    expect(level1.type.kind).toBe("object");
    if (level1.type.kind === "object") {
      expect(level1.type.fields.level2?.type.kind).toBe("object");
    }
  });

  it("detects numeric enum", () => {
    const docs = [{ priority: 1 }, { priority: 2 }, { priority: 3 }, { priority: 1 }];
    const result = inferSchema(docs);

    const priority = f(result, "priority");
    expect(priority.type.kind).toBe("enum");
    if (priority.type.kind === "enum") {
      expect(priority.type.values).toEqual([1, 2, 3]);
    }
  });

  it("does not mark boolean with 2 values as enum", () => {
    const docs = [{ active: true }, { active: false }];
    const result = inferSchema(docs);

    expect(f(result, "active").type.kind).toBe("boolean");
  });
});
