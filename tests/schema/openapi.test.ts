import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { toOpenAPI } from "../../src/schema/openapi.js";

const UserModel = defineModel({
  name: "User",
  container: "users",
  partitionKey: ["/tenantId"],
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    name: z.string(),
  }),
});

describe("toOpenAPI", () => {
  it("generates OpenAPI 3.1 document", () => {
    const doc = toOpenAPI([UserModel]);

    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBe("Cosmio API");
    expect(doc.components.schemas.User).toBeDefined();
  });

  it("respects custom title and version", () => {
    const doc = toOpenAPI([UserModel], {
      title: "My API",
      version: "2.0.0",
    });

    expect(doc.info.title).toBe("My API");
    expect(doc.info.version).toBe("2.0.0");
  });

  it("generates CRUD paths when requested", () => {
    const doc = toOpenAPI([UserModel], { generatePaths: true });

    expect(doc.paths["/users"]).toBeDefined();
    expect(doc.paths["/users/{id}"]).toBeDefined();

    const listOp = (doc.paths["/users"] as Record<string, unknown>).get as Record<string, unknown>;
    expect(listOp.operationId).toBe("listUser");
  });

  it("does not generate paths by default", () => {
    const doc = toOpenAPI([UserModel]);
    expect(Object.keys(doc.paths)).toHaveLength(0);
  });

  it("includes schema references in paths", () => {
    const doc = toOpenAPI([UserModel], { generatePaths: true });
    const usersPath = doc.paths["/users"] as Record<string, unknown>;
    const postOp = usersPath.post as {
      requestBody?: { content: { "application/json": { schema: { $ref: string } } } };
    };
    const ref = postOp.requestBody!.content["application/json"].schema.$ref;
    expect(ref).toBe("#/components/schemas/User");
  });
});
