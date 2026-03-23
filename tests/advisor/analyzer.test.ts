import { describe, expect, it } from "vitest";
import { z } from "zod";
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
    createdAt: z.number(),
  }),
});

const ArticleModel = defineModel({
  name: "Article",
  container: "content",
  partitionKey: ["/tenantId"],
  discriminator: { field: "type", value: "article" },
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    type: z.literal("article"),
    title: z.string(),
  }),
});

const CommentModel = defineModel({
  name: "Comment",
  container: "content",
  partitionKey: ["/tenantId"],
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    body: z.string(),
    articleId: z.string(),
  }),
});

describe("analyze", () => {
  it("returns a report with summary and cost breakdowns", () => {
    const inputs: ModelWithPatterns[] = [
      {
        model: UserModel,
        patterns: [{ name: "Create user", operation: "create", rps: 1 }],
      },
    ];
    const report = analyze(inputs);
    expect(report.summary).toContain("1 model(s)");
    expect(report.costBreakdowns).toHaveLength(1);
    expect(report.costBreakdowns[0]!.throughputRecommendation).toBeDefined();
  });

  it("detects cross-partition queries (QRY001)", () => {
    const inputs: ModelWithPatterns[] = [
      {
        model: UserModel,
        patterns: [
          {
            name: "Search by email",
            operation: "query",
            rps: 10,
            fields: [{ field: "email", usage: "filter", operator: "=" }],
          },
        ],
      },
    ];

    const report = analyze(inputs);
    const finding = report.findings.find((f) => f.adviceId === "QRY001");
    expect(finding).toBeDefined();
    expect(finding!.category).toBe("performance");
    expect(finding!.designPattern?.pattern).toBe("materialized-view");
  });

  it("does not flag single-partition queries", () => {
    const inputs: ModelWithPatterns[] = [
      {
        model: UserModel,
        patterns: [
          {
            name: "List users by tenant",
            operation: "query",
            fields: [
              { field: "tenantId", usage: "filter", operator: "=" },
              { field: "name", usage: "filter", operator: "CONTAINS" },
            ],
          },
        ],
      },
    ];

    const report = analyze(inputs);
    expect(report.findings.find((f) => f.adviceId === "QRY001")).toBeUndefined();
  });

  it("warns about shared container without discriminator (REL001)", () => {
    const inputs: ModelWithPatterns[] = [
      { model: ArticleModel, patterns: [] },
      { model: CommentModel, patterns: [] },
    ];

    const report = analyze(inputs);
    const finding = report.findings.find((f) => f.adviceId === "REL001" && f.model === "Comment");
    expect(finding).toBeDefined();
    expect(finding!.category).toBe("reliability");
  });

  it("suggests composite index (IDX002)", () => {
    const inputs: ModelWithPatterns[] = [
      {
        model: UserModel,
        patterns: [
          {
            name: "List by tenant, sort by date",
            operation: "query",
            fields: [
              { field: "tenantId", usage: "filter", operator: "=" },
              { field: "createdAt", usage: "sort" },
            ],
          },
        ],
      },
    ];

    const report = analyze(inputs);
    const suggestion = report.findings.find((f) => f.adviceId === "IDX002");
    expect(suggestion).toBeDefined();
    expect(suggestion!.category).toBe("performance");
    expect(suggestion!.recommendation).toContain("composite index");
  });

  it("warns about id as partition key (PK001)", () => {
    const BadModel = defineModel({
      name: "Bad",
      container: "bad",
      partitionKey: ["/id"],
      schema: z.object({ id: z.string() }),
    });

    const report = analyze([{ model: BadModel, patterns: [] }]);
    const finding = report.findings.find((f) => f.adviceId === "PK001");
    expect(finding).toBeDefined();
    expect(finding!.category).toBe("performance");
  });

  it("warns about large documents (CST001)", () => {
    const inputs: ModelWithPatterns[] = [
      {
        model: UserModel,
        patterns: [{ name: "Big create", operation: "create", avgDocumentSizeBytes: 500_000 }],
      },
    ];

    const report = analyze(inputs);
    expect(report.findings.find((f) => f.adviceId === "CST001")).toBeDefined();
  });

  it("info about default indexing policy (CST002)", () => {
    const report = analyze([{ model: UserModel, patterns: [] }]);
    const finding = report.findings.find((f) => f.adviceId === "CST002");
    expect(finding).toBeDefined();
    expect(finding!.category).toBe("cost");
  });

  it("estimates RUs and monthly cost", () => {
    const inputs: ModelWithPatterns[] = [
      {
        model: UserModel,
        patterns: [
          { name: "Point read", operation: "point-read", rps: 100 },
          { name: "Create", operation: "create", rps: 10 },
        ],
      },
    ];

    const report = analyze(inputs);
    expect(report.ruEstimates).toHaveLength(2);
    expect(report.costBreakdowns[0]!.estimatedMonthlyCostUSD).toBeGreaterThan(0);
    expect(report.summary).toContain("$");
  });

  it("recommends design patterns for cross-partition queries", () => {
    const inputs: ModelWithPatterns[] = [
      {
        model: UserModel,
        patterns: [
          {
            name: "Search by email",
            operation: "query",
            fields: [{ field: "email", usage: "filter" }],
          },
        ],
      },
    ];

    const report = analyze(inputs);
    const mvRec = report.designPatternRecommendations.find(
      (r) => r.pattern === "materialized-view",
    );
    expect(mvRec).toBeDefined();
    expect(mvRec!.referenceUrl).toContain("github.com");
  });

  it("recommends schema-versioning when model has migrate", () => {
    const MigratedModel = defineModel({
      name: "Migrated",
      container: "migrated",
      partitionKey: ["/tenantId"],
      schema: z.object({ id: z.string(), tenantId: z.string() }),
      migrate: (d) => d,
    });

    const report = analyze([{ model: MigratedModel, patterns: [] }]);
    const rec = report.designPatternRecommendations.find((r) => r.pattern === "schema-versioning");
    expect(rec).toBeDefined();
  });

  it("recommends event-sourcing for high-write time-series", () => {
    const inputs: ModelWithPatterns[] = [
      {
        model: UserModel,
        patterns: [
          {
            name: "Ingest events",
            operation: "create",
            rps: 100,
            fields: [{ field: "createdAt", usage: "sort" }],
          },
        ],
      },
    ];

    const report = analyze(inputs);
    const rec = report.designPatternRecommendations.find((r) => r.pattern === "event-sourcing");
    expect(rec).toBeDefined();
  });
});
