/**
 * Advisor example: Analyze models and access patterns for optimization.
 *
 * Run with: npx tsx examples/advisor.ts
 * (No DB connection needed — runs entirely offline)
 */
import { z } from "zod";
import {
  defineModel,
  analyzeModels,
  generateAdvisorPrompt,
  type ModelWithPatterns,
} from "../src/index.js";

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

const OrderModel = defineModel({
  name: "Order",
  container: "orders",
  partitionKey: ["/customerId"],
  schema: z.object({
    id: z.string(),
    customerId: z.string(),
    status: z.string(),
    total: z.number(),
    createdAt: z.number(),
  }),
});

// Define how your app accesses data
const inputs: ModelWithPatterns[] = [
  {
    model: UserModel,
    patterns: [
      { name: "Get user", operation: "point-read", rps: 200 },
      {
        name: "Search by email",
        operation: "query",
        rps: 20,
        fields: [{ field: "email", usage: "filter", operator: "=" }],
        description: "Login flow — searches by email across all tenants",
      },
      {
        name: "List tenant users",
        operation: "query",
        rps: 50,
        fields: [
          { field: "tenantId", usage: "filter", operator: "=" },
          { field: "createdAt", usage: "sort" },
        ],
      },
    ],
  },
  {
    model: OrderModel,
    patterns: [
      { name: "Create order", operation: "create", rps: 30, avgDocumentSizeBytes: 2048 },
      {
        name: "List customer orders",
        operation: "query",
        rps: 100,
        fields: [
          { field: "customerId", usage: "filter", operator: "=" },
          { field: "createdAt", usage: "sort" },
        ],
      },
      {
        name: "Search by status",
        operation: "query",
        rps: 10,
        fields: [{ field: "status", usage: "filter", operator: "=" }],
        description: "Admin dashboard — filter orders by status",
      },
    ],
  },
];

// Run rule-based analysis
const report = analyzeModels(inputs);

console.log("=== Summary ===");
console.log(report.summary);
console.log();

console.log("=== Findings ===");
for (const f of report.findings) {
  console.log(`[${f.severity.toUpperCase()}] ${f.adviceId}: ${f.title} (${f.model})`);
  console.log(`  → ${f.recommendation}`);
  if (f.designPattern) {
    console.log(`  📐 Pattern: ${f.designPattern.pattern} — ${f.designPattern.reason}`);
  }
  console.log();
}

console.log("=== Cost Breakdown ===");
for (const c of report.costBreakdowns) {
  console.log(
    `${c.model}: ${c.totalRUPerSecond} RU/s (~$${c.estimatedMonthlyCostUSD}/mo) → ${c.throughputRecommendation}`,
  );
}
console.log();

console.log("=== Design Pattern Recommendations ===");
for (const rec of report.designPatternRecommendations) {
  console.log(`- ${rec.pattern}: ${rec.reason}`);
  console.log(`  ${rec.referenceUrl}`);
}

// Generate AI prompt (optional — send to Claude/GPT for deeper analysis)
const prompt = generateAdvisorPrompt(inputs, report);
console.log(`\n=== AI Prompt (${prompt.length} chars) ===`);
console.log("Use generateAdvisorPrompt() to get a structured prompt for AI analysis.");
