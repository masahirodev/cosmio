import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateAdvisorPrompt } from "../../src/advisor/ai-prompt.js";
import { analyze } from "../../src/advisor/analyzer.js";
import type { ModelWithPatterns } from "../../src/advisor/types.js";
import { defineModel } from "../../src/model/define-model.js";

const UserModel = defineModel({
  name: "User",
  container: "users",
  partitionKey: ["/tenantId"],
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  description: "Application user",
});

const inputs: ModelWithPatterns[] = [
  {
    model: UserModel,
    patterns: [
      {
        name: "Get user by ID",
        operation: "point-read",
        rps: 100,
        description: "Most common read",
      },
      {
        name: "List users by tenant",
        operation: "query",
        rps: 10,
        fields: [
          { field: "tenantId", usage: "filter", operator: "=" },
          { field: "name", usage: "sort" },
        ],
      },
      {
        name: "Search by email",
        operation: "query",
        rps: 5,
        fields: [{ field: "email", usage: "filter", operator: "=" }],
      },
    ],
  },
];

describe("generateAdvisorPrompt", () => {
  it("includes model information", () => {
    const prompt = generateAdvisorPrompt(inputs);
    expect(prompt).toContain("# Azure Cosmos DB Model Optimization Request");
    expect(prompt).toContain("### User");
    expect(prompt).toContain("`/tenantId`");
  });

  it("includes Cosmos DB design patterns reference table", () => {
    const prompt = generateAdvisorPrompt(inputs);
    expect(prompt).toContain("Reference: Cosmos DB Design Patterns");
    expect(prompt).toContain("Attribute Array");
    expect(prompt).toContain("Materialized View");
    expect(prompt).toContain("Schema Versioning");
    expect(prompt).toContain("Event Sourcing");
    expect(prompt).toContain("Data Binning");
  });

  it("includes access patterns table", () => {
    const prompt = generateAdvisorPrompt(inputs);
    expect(prompt).toContain("Get user by ID");
    expect(prompt).toContain("point-read");
    expect(prompt).toContain("100");
    expect(prompt).toContain("tenantId(filter:=)");
  });

  it("includes Azure Advisor 5 categories in output request", () => {
    const prompt = generateAdvisorPrompt(inputs);
    expect(prompt).toContain("### 1. Cost");
    expect(prompt).toContain("### 2. Performance");
    expect(prompt).toContain("### 3. Reliability");
    expect(prompt).toContain("### 4. Security");
    expect(prompt).toContain("### 5. Operational Excellence");
  });

  it("includes automated report with adviceIds when provided", () => {
    const report = analyze(inputs);
    const prompt = generateAdvisorPrompt(inputs, report);
    expect(prompt).toContain("## Automated Analysis");
    expect(prompt).toContain("QRY001");
    expect(prompt).toContain("Cost Breakdown");
    expect(prompt).toContain("Design Pattern Recommendations");
  });

  it("includes cost breakdown table", () => {
    const report = analyze(inputs);
    const prompt = generateAdvisorPrompt(inputs, report);
    expect(prompt).toContain("Read RU/s");
    expect(prompt).toContain("Write RU/s");
    expect(prompt).toContain("Est. $/month");
  });

  it("includes JSON schema", () => {
    const prompt = generateAdvisorPrompt(inputs);
    expect(prompt).toContain('"x-cosmio-container"');
    expect(prompt).toContain('"properties"');
  });
});
