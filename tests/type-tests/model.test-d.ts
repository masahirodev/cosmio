import { assertType, describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import type { PathValue } from "../../src/types/partition-key.js";

describe("type inference", () => {
  const schema = z.object({
    id: z.string(),
    tenantId: z.string(),
    siteId: z.string(),
    name: z.string(),
    count: z.number(),
  });

  const model = defineModel({
    name: "Test",
    container: "tests",
    partitionKey: ["/tenantId", "/siteId"],
    schema,
  });

  it("infers output type from schema", () => {
    type Output = typeof model._types.output;
    expectTypeOf<Output>().toEqualTypeOf<{
      id: string;
      tenantId: string;
      siteId: string;
      name: string;
      count: number;
    }>();
  });

  it("infers partition key values tuple", () => {
    type PKValues = typeof model._types.partitionKeyValues;
    // Mapped tuple should have string for both positions
    assertType<PKValues>(["t1", "s1"] as unknown as PKValues);
    expectTypeOf<PKValues[0]>().toBeString();
    expectTypeOf<PKValues[1]>().toBeString();
  });

  it("PathValue extracts correct field type", () => {
    type TenantId = PathValue<typeof schema, "/tenantId">;
    expectTypeOf<TenantId>().toBeString();

    type Count = PathValue<typeof schema, "/count">;
    expectTypeOf<Count>().toBeNumber();
  });

  it("single partition key infers correctly", () => {
    const singlePkModel = defineModel({
      name: "Single",
      container: "singles",
      partitionKey: ["/tenantId"],
      schema,
    });

    type PKValues = typeof singlePkModel._types.partitionKeyValues;
    expectTypeOf<PKValues[0]>().toBeString();
  });

  it("defaults make fields optional in input type", () => {
    const modelWithDefaults = defineModel({
      name: "WithDefaults",
      container: "test",
      partitionKey: ["/tenantId"],
      schema: z.object({
        id: z.string(),
        tenantId: z.string(),
        status: z.string(),
        createdAt: z.string(),
      }),
      defaults: {
        status: "draft",
        createdAt: () => new Date().toISOString(),
      },
    });

    type Input = typeof modelWithDefaults._types.input;

    // id and tenantId are still required
    expectTypeOf<Input>().toHaveProperty("id");
    expectTypeOf<Input["id"]>().toBeString();
    expectTypeOf<Input>().toHaveProperty("tenantId");
    expectTypeOf<Input["tenantId"]>().toBeString();

    // status and createdAt should be optional
    expectTypeOf<Input>().toHaveProperty("status");
    expectTypeOf<Input>().toHaveProperty("createdAt");

    // Can assign without default fields
    const validInput: Input = { id: "1", tenantId: "t1" };
    assertType<Input>(validInput);

    // Can also provide them explicitly
    const fullInput: Input = {
      id: "1",
      tenantId: "t1",
      status: "active",
      createdAt: "2025-01-01",
    };
    assertType<Input>(fullInput);
  });

  it("no defaults means all fields required in input", () => {
    type Input = typeof model._types.input;

    // All fields are required
    const input: Input = {
      id: "1",
      tenantId: "t1",
      siteId: "s1",
      name: "test",
      count: 1,
    };
    assertType<Input>(input);
  });
});

describe("DTO type inference", () => {
  const dtoModel = defineModel({
    name: "DtoTest",
    container: "tests",
    partitionKey: ["/tenantId"],
    schema: z.object({
      id: z.string(),
      tenantId: z.string(),
      name: z.string(),
      email: z.string(),
      passwordHash: z.string(),
      score: z.number(),
    }),
    dto: {
      api: { omit: ["passwordHash", "score"] as const },
      admin: { omit: ["passwordHash"] as const },
      public: { pick: ["id", "name"] as const },
    },
  });

  it("omit DTO removes specified fields from type", () => {
    type ApiDto = typeof dtoModel._types.dto.api;
    expectTypeOf<ApiDto>().toEqualTypeOf<{
      id: string;
      tenantId: string;
      name: string;
      email: string;
    }>();
  });

  it("admin DTO keeps score but removes passwordHash", () => {
    type AdminDto = typeof dtoModel._types.dto.admin;
    expectTypeOf<AdminDto>().toEqualTypeOf<{
      id: string;
      tenantId: string;
      name: string;
      email: string;
      score: number;
    }>();
  });

  it("pick DTO includes only specified fields", () => {
    type PublicDto = typeof dtoModel._types.dto.public;
    expectTypeOf<PublicDto>().toEqualTypeOf<{
      id: string;
      name: string;
    }>();
  });

  it("toDto returns correctly typed result", () => {
    const doc = {} as Record<string, unknown>;
    const apiResult = dtoModel.toDto("api", doc);
    expectTypeOf(apiResult).toEqualTypeOf<{
      id: string;
      tenantId: string;
      name: string;
      email: string;
    }>();

    const publicResult = dtoModel.toDto("public", doc);
    expectTypeOf(publicResult).toEqualTypeOf<{
      id: string;
      name: string;
    }>();
  });

  it("model without dto has empty dto types", () => {
    const noDtoModel = defineModel({
      name: "NoDto",
      container: "tests",
      partitionKey: ["/tenantId"],
      schema: z.object({
        id: z.string(),
        tenantId: z.string(),
      }),
    });

    type DtoTypes = typeof noDtoModel._types.dto;
    expectTypeOf<DtoTypes>().toEqualTypeOf<Record<string, never>>();
  });
});
