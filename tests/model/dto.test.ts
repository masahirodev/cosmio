import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { defineDtoPolicy } from "../../src/model/dto-policy.js";

const schema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  email: z.string(),
  passwordHash: z.string(),
  internalScore: z.number(),
  createdAt: z.string(),
});

describe("DTO - defineModel", () => {
  it("creates model with named DTOs using omit", () => {
    const model = defineModel({
      name: "User",
      container: "users",
      partitionKey: ["/tenantId"],
      schema,
      dto: {
        api: { omit: ["passwordHash", "internalScore"] as const },
        admin: { omit: ["passwordHash"] as const },
      },
    });

    expect(model.dtoSchemas.api).toBeDefined();
    expect(model.dtoSchemas.admin).toBeDefined();
  });

  it("creates model with named DTOs using pick", () => {
    const model = defineModel({
      name: "User",
      container: "users",
      partitionKey: ["/tenantId"],
      schema,
      dto: {
        public: { pick: ["id", "name"] as const },
      },
    });

    expect(model.dtoSchemas.public).toBeDefined();
  });

  it("creates model with mixed omit and pick DTOs", () => {
    const model = defineModel({
      name: "User",
      container: "users",
      partitionKey: ["/tenantId"],
      schema,
      dto: {
        api: { omit: ["passwordHash", "internalScore"] as const },
        public: { pick: ["id", "name"] as const },
      },
    });

    expect(model.dtoSchemas.api).toBeDefined();
    expect(model.dtoSchemas.public).toBeDefined();
  });

  it("dtoSchemas is empty when dto is not configured", () => {
    const model = defineModel({
      name: "User",
      container: "users",
      partitionKey: ["/tenantId"],
      schema,
    });

    expect(model.dtoSchemas).toEqual({});
  });

  it("throws if omit field does not exist in schema", () => {
    expect(() =>
      defineModel({
        name: "User",
        container: "users",
        partitionKey: ["/tenantId"],
        schema,
        dto: {
          api: { omit: ["nonExistent"] as never },
        },
      }),
    ).toThrow('DTO "api" omit field "nonExistent" is not defined in the schema');
  });

  it("throws if pick field does not exist in schema", () => {
    expect(() =>
      defineModel({
        name: "User",
        container: "users",
        partitionKey: ["/tenantId"],
        schema,
        dto: {
          public: { pick: ["nonExistent"] as never },
        },
      }),
    ).toThrow('DTO "public" pick field "nonExistent" is not defined in the schema');
  });
});

describe("DTO - toDto()", () => {
  const model = defineModel({
    name: "User",
    container: "users",
    partitionKey: ["/tenantId"],
    schema,
    dto: {
      api: { omit: ["passwordHash", "internalScore"] as const },
      admin: { omit: ["passwordHash"] as const },
      public: { pick: ["id", "name"] as const },
    },
  });

  const fullDoc = {
    id: "u1",
    tenantId: "t1",
    name: "Alice",
    email: "alice@example.com",
    passwordHash: "$2b$10$secret",
    internalScore: 42,
    createdAt: "2025-01-01T00:00:00Z",
    _rid: "abc123",
    _self: "/dbs/mydb/colls/users/docs/abc123",
    _etag: '"etag"',
    _ts: 1700000000,
  };

  it("omit strips specified fields", () => {
    const result = model.toDto("api", fullDoc);
    expect(result).toEqual({
      id: "u1",
      tenantId: "t1",
      name: "Alice",
      email: "alice@example.com",
      createdAt: "2025-01-01T00:00:00Z",
    });
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("internalScore");
    // Cosmos system fields are also stripped by Zod (not in schema)
    expect(result).not.toHaveProperty("_rid");
  });

  it("admin DTO keeps internalScore but strips passwordHash", () => {
    const result = model.toDto("admin", fullDoc);
    expect(result).toHaveProperty("internalScore", 42);
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("pick returns only specified fields", () => {
    const result = model.toDto("public", fullDoc);
    expect(result).toEqual({
      id: "u1",
      name: "Alice",
    });
    expect(Object.keys(result)).toEqual(["id", "name"]);
  });

  it("throws for undefined DTO name", () => {
    expect(() => {
      (model as { toDto: (name: string, doc: unknown) => unknown }).toDto("nonExistent", fullDoc);
    }).toThrow('DTO "nonExistent" is not defined in model "User"');
  });

  it("throws if doc is missing required fields", () => {
    expect(() => {
      model.toDto("api", { id: "u1" });
    }).toThrow(); // Zod validation error
  });
});

describe("DTO - DtoPolicy", () => {
  const model = defineModel({
    name: "User",
    container: "users",
    partitionKey: ["/tenantId"],
    schema,
    dto: {
      api: { omit: ["passwordHash", "internalScore"] as const },
    },
  });

  const fullDoc = {
    id: "u1",
    tenantId: "t1",
    name: "Alice",
    email: "alice@example.com",
    passwordHash: "$2b$10$secret",
    internalScore: 42,
    createdAt: "2025-01-01T00:00:00Z",
    _rid: "abc123",
    _self: "/dbs/mydb/colls/users/docs/abc123",
    _etag: '"etag"',
    _ts: 1700000000,
  };

  it("applies global omit on top of model DTO", () => {
    const policy = defineDtoPolicy({
      globalOmit: ["_rid", "_self", "_ts", "_etag", "tenantId"],
    });

    const result = policy.apply(model, "api", fullDoc);

    // Model DTO already strips passwordHash, internalScore
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("internalScore");
    // Policy additionally strips tenantId
    expect(result).not.toHaveProperty("tenantId");
    // Cosmos system fields already stripped by Zod, but policy handles edge cases
    expect(result).not.toHaveProperty("_rid");

    expect(result).toEqual({
      id: "u1",
      name: "Alice",
      email: "alice@example.com",
      createdAt: "2025-01-01T00:00:00Z",
    });
  });

  it("strip() applies only global omit without model DTO", () => {
    const policy = defineDtoPolicy({
      globalOmit: ["_rid", "_self", "_ts", "_etag"],
    });

    const result = policy.strip(fullDoc);

    // Only global fields stripped
    expect(result).not.toHaveProperty("_rid");
    expect(result).not.toHaveProperty("_self");
    expect(result).not.toHaveProperty("_ts");
    expect(result).not.toHaveProperty("_etag");
    // Everything else remains
    expect(result).toHaveProperty("passwordHash");
    expect(result).toHaveProperty("internalScore");
  });

  it("globalOmit getter returns the set", () => {
    const policy = defineDtoPolicy({
      globalOmit: ["_rid", "_self"],
    });

    expect(policy.globalOmit.has("_rid")).toBe(true);
    expect(policy.globalOmit.has("_self")).toBe(true);
    expect(policy.globalOmit.has("_ts")).toBe(false);
  });
});

describe("DTO - DtoPolicy overrides", () => {
  const auditSchema = z.object({
    id: z.string(),
    tenantId: z.string(),
    action: z.string(),
    timestamp: z.string(),
  });

  const auditModel = defineModel({
    name: "AuditLog",
    container: "audit",
    partitionKey: ["/tenantId"],
    schema: auditSchema,
    dto: {
      api: { pick: ["id", "action", "timestamp"] as const },
    },
  });

  const sessionSchema = z.object({
    id: z.string(),
    userId: z.string(),
    sessionToken: z.string(),
    expiresAt: z.string(),
  });

  const sessionModel = defineModel({
    name: "Session",
    container: "sessions",
    partitionKey: ["/userId"],
    schema: sessionSchema,
    dto: {
      api: { omit: [] as const },
    },
  });

  const policy = defineDtoPolicy({
    globalOmit: ["_rid", "_self", "_ts", "_etag"],
    overrides: {
      AuditLog: { include: ["_ts"] },
      Session: { omit: ["sessionToken"] },
    },
  });

  it("override include re-allows globally omitted fields", () => {
    const doc = {
      id: "a1",
      tenantId: "t1",
      action: "login",
      timestamp: "2025-01-01",
      _rid: "rid",
      _self: "self",
      _ts: 1700000000,
      _etag: "etag",
    };

    // apply() uses model DTO first (pick: id, action, timestamp), then policy
    const applied = policy.apply(auditModel, "api", doc);
    expect(applied).toHaveProperty("id", "a1");
    expect(applied).toHaveProperty("action", "login");
    expect(applied).not.toHaveProperty("_rid");

    // strip() doesn't apply model DTO — tests the override directly
    const stripped = policy.strip(doc, "AuditLog");
    expect(stripped).toHaveProperty("_ts", 1700000000);
    expect(stripped).not.toHaveProperty("_rid");
    expect(stripped).not.toHaveProperty("_self");
    expect(stripped).not.toHaveProperty("_etag");
  });

  it("override omit adds extra fields to strip", () => {
    const doc = {
      id: "s1",
      userId: "u1",
      sessionToken: "secret-token",
      expiresAt: "2025-12-31",
      _rid: "rid",
    };

    const result = policy.apply(sessionModel, "api", doc);

    // sessionToken should be stripped by the policy override
    expect(result).not.toHaveProperty("sessionToken");
    // Normal fields remain
    expect(result).toHaveProperty("id", "s1");
    expect(result).toHaveProperty("userId", "u1");
    expect(result).toHaveProperty("expiresAt", "2025-12-31");
  });

  it("strip() with modelName applies per-model overrides", () => {
    const doc = {
      id: "s1",
      userId: "u1",
      sessionToken: "secret",
      expiresAt: "2025-12-31",
      _rid: "rid",
      _ts: 123,
    };

    const result = policy.strip(doc, "Session");
    expect(result).not.toHaveProperty("sessionToken");
    expect(result).not.toHaveProperty("_rid");
    expect(result).not.toHaveProperty("_ts");
    expect(result).toHaveProperty("userId");
  });

  it("strip() without modelName uses only globalOmit", () => {
    const doc = {
      id: "s1",
      sessionToken: "secret",
      _rid: "rid",
    };

    const result = policy.strip(doc);
    // Only global fields stripped
    expect(result).not.toHaveProperty("_rid");
    // sessionToken is model-specific, should remain
    expect(result).toHaveProperty("sessionToken");
  });

  it("resolvedOmitFor returns effective omit set", () => {
    const auditOmit = policy.resolvedOmitFor("AuditLog");
    // _ts excluded by include override
    expect(auditOmit.has("_ts")).toBe(false);
    expect(auditOmit.has("_rid")).toBe(true);

    const sessionOmit = policy.resolvedOmitFor("Session");
    // sessionToken added by omit override
    expect(sessionOmit.has("sessionToken")).toBe(true);
    expect(sessionOmit.has("_rid")).toBe(true);

    // Unknown model gets globalOmit as-is
    const unknownOmit = policy.resolvedOmitFor("Unknown");
    expect(unknownOmit.has("_rid")).toBe(true);
    expect(unknownOmit.has("sessionToken")).toBe(false);
  });

  it("override with both include and omit", () => {
    const combined = defineDtoPolicy({
      globalOmit: ["_rid", "_self", "_ts", "_etag"],
      overrides: {
        Special: { include: ["_ts", "_etag"], omit: ["secretField"] },
      },
    });

    const omitSet = combined.resolvedOmitFor("Special");
    // _ts and _etag re-included
    expect(omitSet.has("_ts")).toBe(false);
    expect(omitSet.has("_etag")).toBe(false);
    // _rid and _self still omitted
    expect(omitSet.has("_rid")).toBe(true);
    expect(omitSet.has("_self")).toBe(true);
    // secretField additionally omitted
    expect(omitSet.has("secretField")).toBe(true);
  });
});
