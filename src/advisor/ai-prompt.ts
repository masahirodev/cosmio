import type { z } from "zod";
import type { ModelDefinition } from "../model/model-types.js";
import { toJsonSchema } from "../schema/json-schema.js";
import { DESIGN_PATTERNS } from "./design-patterns.js";
import type { AdvisorReport, ModelWithPatterns } from "./types.js";

/**
 * Generate a structured prompt for AI-powered Cosmos DB optimization.
 *
 * Follows the Azure AI Skills pattern:
 * - Structured input (models, patterns, schema)
 * - Structured output request (categorized recommendations)
 * - References official Cosmos DB design patterns
 *
 * @example
 * ```ts
 * const prompt = generateAdvisorPrompt(modelsWithPatterns, report);
 * const advice = await anthropic.messages.create({
 *   model: "claude-sonnet-4-20250514",
 *   messages: [{ role: "user", content: prompt }],
 * });
 * ```
 */
export function generateAdvisorPrompt(inputs: ModelWithPatterns[], report?: AdvisorReport): string {
  const sections: string[] = [];

  // --- System context ---
  sections.push("# Azure Cosmos DB Model Optimization Request");
  sections.push("");
  sections.push(
    "You are an Azure Cosmos DB expert advisor. Analyze the following NoSQL data models, " +
      "access patterns, and automated analysis results. Provide specific, actionable optimization recommendations " +
      "following the Azure Advisor framework (Cost, Performance, Reliability, Security, Operational Excellence).",
  );
  sections.push("");

  // --- Available Design Patterns reference ---
  sections.push("## Reference: Cosmos DB Design Patterns");
  sections.push("");
  sections.push(
    "When making recommendations, reference these official patterns where applicable " +
      "(source: https://github.com/Azure-Samples/cosmos-db-design-patterns):",
  );
  sections.push("");
  sections.push("| Pattern | Description | When to Use |");
  sections.push("|---------|-------------|-------------|");
  for (const [, info] of Object.entries(DESIGN_PATTERNS)) {
    sections.push(`| ${info.name} | ${info.description} | ${info.whenToUse} |`);
  }
  sections.push("");

  // --- Models section ---
  sections.push("## Input: Models & Access Patterns");
  sections.push("");

  for (const { model, patterns } of inputs) {
    sections.push(`### ${model.name}`);
    sections.push("");
    sections.push(`- **Container:** \`${model.container}\``);
    sections.push(`- **Partition Key:** ${model.partitionKey.map((p) => `\`${p}\``).join(", ")}`);
    if (model.discriminator) {
      sections.push(
        `- **Discriminator:** \`${model.discriminator.field}\` = \`"${model.discriminator.value}"\``,
      );
    }
    if (model.defaultTtl !== undefined) {
      sections.push(`- **TTL:** ${model.defaultTtl}s`);
    }
    if (model.uniqueKeyPolicy) {
      sections.push(`- **Unique Keys:** ${JSON.stringify(model.uniqueKeyPolicy.uniqueKeys)}`);
    }
    if (model.description) {
      sections.push(`- **Description:** ${model.description}`);
    }

    // JSON Schema
    const schema = toJsonSchema(
      model as unknown as ModelDefinition<
        z.ZodObject<z.ZodRawShape>,
        readonly [string, ...string[]]
      >,
    );
    sections.push("");
    sections.push("**Schema:**");
    sections.push("```json");
    sections.push(JSON.stringify(schema, null, 2));
    sections.push("```");

    if (model.indexingPolicy) {
      sections.push("");
      sections.push("**Indexing Policy:**");
      sections.push("```json");
      sections.push(JSON.stringify(model.indexingPolicy, null, 2));
      sections.push("```");
    }

    // Access patterns
    if (patterns.length > 0) {
      sections.push("");
      sections.push("**Access Patterns:**");
      sections.push("");
      sections.push("| # | Name | Operation | RPS | Doc Size | Fields | Description |");
      sections.push("|---|------|-----------|-----|----------|--------|-------------|");

      patterns.forEach((p, i) => {
        const fieldsStr =
          p.fields
            ?.map((f) => `${f.field}(${f.usage}${f.operator ? `:${f.operator}` : ""})`)
            .join(", ") ?? "-";
        const docSize = p.avgDocumentSizeBytes
          ? `${Math.round(p.avgDocumentSizeBytes / 1024)}KB`
          : "-";
        sections.push(
          `| ${i + 1} | ${p.name} | ${p.operation} | ${p.rps ?? "?"} | ${docSize} | ${fieldsStr} | ${p.description ?? "-"} |`,
        );
      });
    }
    sections.push("");
  }

  // --- Container sharing ---
  const containerMap = new Map<string, string[]>();
  for (const { model } of inputs) {
    const list = containerMap.get(model.container) ?? [];
    list.push(model.name);
    containerMap.set(model.container, list);
  }
  const sharedContainers = [...containerMap.entries()].filter(([, models]) => models.length > 1);
  if (sharedContainers.length > 0) {
    sections.push("## Shared Containers (Single-Table Design)");
    sections.push("");
    for (const [container, models] of sharedContainers) {
      sections.push(`- \`${container}\`: ${models.join(", ")}`);
    }
    sections.push("");
  }

  // --- Automated analysis results ---
  if (report) {
    sections.push("## Automated Analysis (Rule-Based)");
    sections.push("");
    sections.push(`**Summary:** ${report.summary}`);
    sections.push("");

    if (report.findings.length > 0) {
      sections.push("### Findings");
      sections.push("");
      sections.push("| ID | Severity | Category | Model | Title |");
      sections.push("|----|----------|----------|-------|-------|");
      for (const f of report.findings) {
        sections.push(
          `| ${f.adviceId} | ${f.severity} | ${f.category} | ${f.model} | ${f.title} |`,
        );
      }
      sections.push("");

      // Details
      for (const f of report.findings) {
        sections.push(`**${f.adviceId}: ${f.title}**`);
        sections.push(`- ${f.detail}`);
        sections.push(`- Recommendation: ${f.recommendation}`);
        if (f.designPattern) {
          sections.push(
            `- Related Pattern: **${f.designPattern.pattern}** — ${f.designPattern.reason}`,
          );
        }
        sections.push("");
      }
    }

    if (report.ruEstimates.length > 0) {
      sections.push("### RU Estimates");
      sections.push("");
      sections.push("| Model | Pattern | Operation | RU/op | RU/s | Notes |");
      sections.push("|-------|---------|-----------|-------|------|-------|");
      for (const e of report.ruEstimates) {
        sections.push(
          `| ${e.model} | ${e.pattern} | ${e.operation} | ${e.estimatedRU} | ${e.totalRUPerSecond} | ${e.notes} |`,
        );
      }
      sections.push("");
    }

    if (report.costBreakdowns.length > 0) {
      sections.push("### Cost Breakdown");
      sections.push("");
      sections.push(
        "| Model | Read RU/s | Write RU/s | Total RU/s | Est. $/month | Recommendation |",
      );
      sections.push(
        "|-------|-----------|------------|------------|-------------|----------------|",
      );
      for (const c of report.costBreakdowns) {
        sections.push(
          `| ${c.model} | ${c.readRUPerSecond} | ${c.writeRUPerSecond} | ${c.totalRUPerSecond} | $${c.estimatedMonthlyCostUSD} | ${c.throughputRecommendation} |`,
        );
      }
      sections.push("");
    }

    if (report.designPatternRecommendations.length > 0) {
      sections.push("### Design Pattern Recommendations");
      sections.push("");
      for (const rec of report.designPatternRecommendations) {
        sections.push(`- **${rec.pattern}**: ${rec.reason} ([reference](${rec.referenceUrl}))`);
      }
      sections.push("");
    }
  }

  // --- Questions for AI ---
  sections.push("## Please Provide (Azure Advisor Format)");
  sections.push("");
  sections.push(
    "Structure your response using the 5 Azure Advisor categories. " +
      "For each recommendation, include: severity (error/warning/suggestion), title, detail, and specific action items.",
  );
  sections.push("");
  sections.push(
    "### 1. Cost\n" +
      "- RU consumption optimization\n" +
      "- Indexing policy tuning to reduce write costs\n" +
      "- Throughput mode recommendation (serverless vs provisioned vs autoscale)\n" +
      "- Monthly cost estimate based on the access patterns",
  );
  sections.push("");
  sections.push(
    "### 2. Performance\n" +
      "- Partition key evaluation and alternatives\n" +
      "- Cross-partition query elimination strategies\n" +
      "- Composite index recommendations\n" +
      "- Document size optimization\n" +
      "- Which Cosmos DB design patterns to apply",
  );
  sections.push("");
  sections.push(
    "### 3. Reliability\n" +
      "- Data consistency considerations\n" +
      "- Backup and disaster recovery\n" +
      "- Multi-region availability",
  );
  sections.push("");
  sections.push(
    "### 4. Security\n" + "- Sensitive field handling\n" + "- Access control recommendations",
  );
  sections.push("");
  sections.push(
    "### 5. Operational Excellence\n" +
      "- TTL and data lifecycle management\n" +
      "- Monitoring and alerting recommendations\n" +
      "- Schema evolution strategy",
  );
  sections.push("");

  return sections.join("\n");
}
