import { recommendPattern } from "./design-patterns.js";
import type {
  AdvisorFinding,
  AdvisorReport,
  CostBreakdown,
  DesignPatternRecommendation,
  ModelWithPatterns,
  RUEstimate,
} from "./types.js";

/**
 * Analyze models and access patterns following Azure Advisor categories:
 * Cost / Performance / Reliability / Security / Operational Excellence
 *
 * Also recommends official Cosmos DB design patterns where applicable.
 * https://github.com/Azure-Samples/cosmos-db-design-patterns
 */
export function analyze(inputs: ModelWithPatterns[]): AdvisorReport {
  const findings: AdvisorFinding[] = [];
  const ruEstimates: RUEstimate[] = [];
  const patternRecs: DesignPatternRecommendation[] = [];
  const patternRecSet = new Set<string>();

  for (const { model, patterns } of inputs) {
    const pkFields = model.partitionKey.map((p) => (p.startsWith("/") ? p.slice(1) : p));

    // ===== PERFORMANCE =====

    // PK001: id as partition key
    if (pkFields.length === 1 && pkFields[0] === "id") {
      findings.push({
        adviceId: "PK001",
        severity: "warning",
        category: "performance",
        model: model.name,
        title: "Partition key is 'id' — may cause hot partitions",
        detail:
          "Using 'id' as the sole partition key creates one logical partition per document. " +
          "This prevents co-location of related documents and makes cross-partition queries inevitable.",
        recommendation:
          "Use a high-cardinality, frequently-filtered field (e.g., /tenantId, /category) as the partition key.",
        documentationUrl: "https://learn.microsoft.com/azure/cosmos-db/partitioning-overview",
      });
    }

    // PK002: Low-cardinality partition key
    if (
      pkFields.length === 1 &&
      pkFields[0] &&
      ["type", "status", "category", "region", "country"].includes(pkFields[0])
    ) {
      findings.push({
        adviceId: "PK002",
        severity: "warning",
        category: "performance",
        model: model.name,
        title: `Low-cardinality partition key "/${pkFields[0]}" may cause hot partitions`,
        detail: `Field "${pkFields[0]}" typically has few distinct values, leading to large logical partitions and uneven RU distribution.`,
        recommendation:
          "Consider a hierarchical partition key or combine with a higher-cardinality field. " +
          'Example: ["/' +
          pkFields[0] +
          '", "/id"] for hierarchical PK.',
        documentationUrl: "https://learn.microsoft.com/azure/cosmos-db/hierarchical-partition-keys",
      });
    }

    // QRY001: Cross-partition query detection
    for (const pattern of patterns) {
      if (pattern.operation !== "query" || !pattern.fields) continue;

      const filterFields = pattern.fields.filter((f) => f.usage === "filter").map((f) => f.field);
      const filterIncludesPK = filterFields.some((f) => pkFields.includes(f));

      if (!filterIncludesPK && filterFields.length > 0) {
        findings.push({
          adviceId: "QRY001",
          severity: "warning",
          category: "performance",
          model: model.name,
          title: `Cross-partition query: "${pattern.name}"`,
          detail:
            `Filters on [${filterFields.join(", ")}] without partition key [${pkFields.join(", ")}]. ` +
            "Fan-out queries consume significantly more RU.",
          recommendation: `Include partition key in the query filter, or reconsider partition key design for this access pattern.`,
          designPattern: recommendPattern(
            "materialized-view",
            "Create a materialized view partitioned by the query's filter field to avoid cross-partition fan-out.",
          ),
          documentationUrl:
            "https://learn.microsoft.com/azure/cosmos-db/nosql/query/getting-started",
        });
      }
    }

    // IDX001: Excluded path used in queries
    if (model.indexingPolicy?.excludedPaths) {
      const usedFields = new Set<string>();
      for (const p of patterns) {
        for (const f of p.fields ?? []) {
          if (f.usage === "filter" || f.usage === "sort") usedFields.add(f.field);
        }
      }

      for (const excluded of model.indexingPolicy.excludedPaths) {
        const path = excluded.path?.replace(/\/\*$/, "").replace(/^\//, "") ?? "";
        if (usedFields.has(path)) {
          findings.push({
            adviceId: "IDX001",
            severity: "error",
            category: "performance",
            model: model.name,
            title: `Excluded index path "/${path}" is used in queries`,
            detail: `Indexing policy excludes "/${path}/*" but access patterns filter/sort on "${path}". This forces full scans.`,
            recommendation: `Remove "/${path}/*" from excludedPaths or add a composite index.`,
            documentationUrl: "https://learn.microsoft.com/azure/cosmos-db/index-policy",
          });
        }
      }
    }

    // IDX002: Composite index suggestion
    for (const pattern of patterns) {
      if (pattern.operation !== "query" || !pattern.fields) continue;

      const filters = pattern.fields.filter((f) => f.usage === "filter");
      const sorts = pattern.fields.filter((f) => f.usage === "sort");

      if (filters.length > 0 && sorts.length > 0) {
        const compositeFields = [
          ...new Set([...filters.map((f) => f.field), ...sorts.map((f) => f.field)]),
        ];

        if (compositeFields.length >= 2) {
          findings.push({
            adviceId: "IDX002",
            severity: "suggestion",
            category: "performance",
            model: model.name,
            title: `Composite index recommended for "${pattern.name}"`,
            detail: `Filter on [${filters.map((f) => f.field).join(", ")}] + ORDER BY [${sorts.map((f) => f.field).join(", ")}].`,
            recommendation: `Add composite index: [${compositeFields.map((f) => `"/${f}"`).join(", ")}].`,
            documentationUrl:
              "https://learn.microsoft.com/azure/cosmos-db/index-policy#composite-indexes",
          });
        }
      }
    }

    // ===== COST =====

    // CST001: Large document warning
    for (const pattern of patterns) {
      if (pattern.avgDocumentSizeBytes && pattern.avgDocumentSizeBytes > 100_000) {
        findings.push({
          adviceId: "CST001",
          severity: "warning",
          category: "cost",
          model: model.name,
          title: `Large document size (${Math.round(pattern.avgDocumentSizeBytes / 1024)}KB)`,
          detail: `Pattern "${pattern.name}" estimates ${Math.round(pattern.avgDocumentSizeBytes / 1024)}KB/doc. Large docs increase RU cost for every operation.`,
          recommendation:
            "Split large fields into separate documents (reference pattern) or move blobs to Azure Blob Storage.",
        });
        break;
      }
    }

    // CST002: Default indexing policy (indexes everything)
    if (!model.indexingPolicy) {
      findings.push({
        adviceId: "CST002",
        severity: "info",
        category: "cost",
        model: model.name,
        title: "Using default indexing policy (indexes all paths)",
        detail: "The default policy indexes every property, which increases write RU cost.",
        recommendation:
          "Define a custom indexingPolicy excluding paths that are never queried to reduce write costs.",
        documentationUrl: "https://learn.microsoft.com/azure/cosmos-db/index-policy",
      });
    }

    // ===== RELIABILITY =====

    // REL001: Shared container without discriminator
    const sameContainerModels = inputs
      .filter((i) => i.model.container === model.container)
      .map((i) => i.model.name);

    if (sameContainerModels.length > 1 && !model.discriminator) {
      findings.push({
        adviceId: "REL001",
        severity: "warning",
        category: "reliability",
        model: model.name,
        title: "Shared container without discriminator",
        detail: `Container "${model.container}" is shared by [${sameContainerModels.join(", ")}] but "${model.name}" has no discriminator.`,
        recommendation: `Add discriminator: { field: "type", value: "${model.name.toLowerCase()}" }`,
      });
    }

    // ===== OPERATIONAL EXCELLENCE =====

    // OPS001: No TTL on potentially growing containers
    if (
      model.defaultTtl === undefined &&
      patterns.some((p) => p.operation === "create" && (p.rps ?? 0) >= 10)
    ) {
      findings.push({
        adviceId: "OPS001",
        severity: "info",
        category: "operational-excellence",
        model: model.name,
        title: "High write rate without TTL — storage may grow unbounded",
        detail: `Model receives ${patterns.find((p) => p.operation === "create")?.rps ?? "many"} creates/s but has no TTL configured.`,
        recommendation:
          "Consider setting defaultTtl to auto-expire old documents, or implement a cleanup strategy.",
      });
    }

    // ===== DESIGN PATTERN RECOMMENDATIONS =====

    // Schema versioning if migrate is configured
    if (model.migrate) {
      addPatternRec(
        patternRecs,
        patternRecSet,
        "schema-versioning",
        `Model "${model.name}" uses migrate — formalize with the Schema Versioning pattern for version tracking.`,
      );
    }

    // Event sourcing if high write + has createdAt-like sort
    const hasTimeSeries = patterns.some((p) =>
      p.fields?.some(
        (f) =>
          f.usage === "sort" &&
          ["createdAt", "timestamp", "_ts", "eventTime", "occurredAt"].includes(f.field),
      ),
    );
    const highWrites = patterns.some(
      (p) => (p.operation === "create" || p.operation === "upsert") && (p.rps ?? 0) >= 50,
    );
    if (hasTimeSeries && highWrites) {
      addPatternRec(
        patternRecs,
        patternRecSet,
        "event-sourcing",
        "High write rate with time-ordered data — consider Event Sourcing for immutable event streams.",
      );
    }

    // Data binning for time-series aggregation
    if (hasTimeSeries && patterns.some((p) => p.fields?.some((f) => f.usage === "group"))) {
      addPatternRec(
        patternRecs,
        patternRecSet,
        "data-binning",
        "Time-series data with grouping — Data Binning can reduce document count and improve query performance.",
      );
    }

    // Distributed counter for high-concurrency upserts
    const highConcurrencyUpsert = patterns.some(
      (p) => p.operation === "upsert" && (p.rps ?? 0) >= 100,
    );
    if (highConcurrencyUpsert) {
      addPatternRec(
        patternRecs,
        patternRecSet,
        "distributed-counter",
        "Very high upsert rate — if counting/aggregating, split across multiple documents with Distributed Counter.",
      );
    }

    // Materialized view for cross-partition query patterns
    const hasCrossPartition = findings.some(
      (f) => f.adviceId === "QRY001" && f.model === model.name,
    );
    if (hasCrossPartition) {
      addPatternRec(
        patternRecs,
        patternRecSet,
        "materialized-view",
        "Cross-partition queries detected — create a Materialized View partitioned by the query's primary filter.",
      );
    }

    // Document versioning if model has etag patterns or audit needs
    if (
      patterns.some(
        (p) =>
          p.description?.toLowerCase().includes("audit") ||
          p.description?.toLowerCase().includes("history"),
      )
    ) {
      addPatternRec(
        patternRecs,
        patternRecSet,
        "document-versioning",
        "Audit/history access patterns detected — Document Versioning maintains change history efficiently.",
      );
    }

    // Attribute array if many optional fields
    const schemaShape = model.schema.shape;
    const optionalCount = Object.values(schemaShape).filter(
      (v) => (v as { _def: { typeName: string } })._def.typeName === "ZodOptional",
    ).length;
    if (optionalCount >= 5) {
      addPatternRec(
        patternRecs,
        patternRecSet,
        "attribute-array",
        `Model "${model.name}" has ${optionalCount} optional fields — Attribute Array can reduce sparse document size.`,
      );
    }

    // ===== RU ESTIMATES =====

    for (const pattern of patterns) {
      const docSize = pattern.avgDocumentSizeBytes ?? 1024;
      const rps = pattern.rps ?? 1;
      const docKB = Math.max(1, Math.ceil(docSize / 1024));

      let estimatedRU: number;
      let notes: string;

      switch (pattern.operation) {
        case "point-read":
          estimatedRU = docKB;
          notes = `Point read: ~${estimatedRU} RU (${docKB}KB)`;
          break;
        case "create":
        case "upsert":
          estimatedRU = Math.max(5, Math.ceil(docKB * 5.5));
          notes = `Write: ~${estimatedRU} RU (${docKB}KB, includes indexing)`;
          break;
        case "delete":
          estimatedRU = Math.max(5, Math.ceil(docKB * 5));
          notes = `Delete: ~${estimatedRU} RU`;
          break;
        case "patch":
          estimatedRU = Math.max(5, Math.ceil(docKB * 3));
          notes = `Patch: ~${estimatedRU} RU (partial update)`;
          break;
        case "query": {
          const filterFields =
            pattern.fields?.filter((f) => f.usage === "filter").map((f) => f.field) ?? [];
          const isCrossPartition = !filterFields.some((f) => pkFields.includes(f));
          const resultCount = pattern.expectedResultCount ?? 10;
          if (isCrossPartition) {
            estimatedRU = Math.max(10, Math.ceil(resultCount * docKB * 0.3) + 5);
            notes = `Cross-partition query: ~${estimatedRU} RU (fan-out penalty, ~${resultCount} results)`;
          } else {
            estimatedRU = Math.max(3, Math.ceil(resultCount * docKB * 0.15));
            notes = `Single-partition query: ~${estimatedRU} RU (~${resultCount} results)`;
          }
          break;
        }
      }

      ruEstimates.push({
        pattern: pattern.name,
        model: model.name,
        operation: pattern.operation,
        estimatedRU,
        totalRUPerSecond: estimatedRU * rps,
        notes,
      });
    }
  }

  // ===== COST BREAKDOWNS =====

  const costBreakdowns: CostBreakdown[] = [];
  const modelNames = [...new Set(inputs.map((i) => i.model.name))];

  for (const modelName of modelNames) {
    const modelEstimates = ruEstimates.filter((e) => e.model === modelName);
    const readRU = modelEstimates
      .filter((e) => e.operation === "point-read" || e.operation === "query")
      .reduce((s, e) => s + e.totalRUPerSecond, 0);
    const writeRU = modelEstimates
      .filter(
        (e) =>
          e.operation === "create" ||
          e.operation === "upsert" ||
          e.operation === "delete" ||
          e.operation === "patch",
      )
      .reduce((s, e) => s + e.totalRUPerSecond, 0);
    const total = readRU + writeRU;

    // ~$0.00008/RU for provisioned, serverless is ~$0.25 per 1M RU
    // Rough monthly estimate: RU/s * 3600 * 730 (hours/month) * $0.00008 for provisioned
    // Or: total ops/month * $/RU for serverless
    let throughputRecommendation: "serverless" | "provisioned" | "autoscale";
    let monthlyCost: number;

    if (total < 50) {
      // Low throughput → serverless is cheaper
      throughputRecommendation = "serverless";
      // serverless: $0.25 per 1M RU consumed
      const totalOpsPerMonth = total * 3600 * 730;
      monthlyCost = (totalOpsPerMonth / 1_000_000) * 0.25;
    } else if (total < 1000) {
      throughputRecommendation = "autoscale";
      monthlyCost = total * 0.00008 * 3600 * 730;
    } else {
      throughputRecommendation = "provisioned";
      monthlyCost = total * 0.00008 * 3600 * 730;
    }

    costBreakdowns.push({
      model: modelName,
      readRUPerSecond: Math.round(readRU),
      writeRUPerSecond: Math.round(writeRU),
      totalRUPerSecond: Math.round(total),
      estimatedMonthlyCostUSD: Math.round(monthlyCost * 100) / 100,
      throughputRecommendation,
    });
  }

  // Summary
  const totalRU = ruEstimates.reduce((sum, e) => sum + e.totalRUPerSecond, 0);
  const totalMonthlyCost = costBreakdowns.reduce((s, c) => s + c.estimatedMonthlyCostUSD, 0);
  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warnCount = findings.filter((f) => f.severity === "warning").length;
  const suggestionCount = findings.filter(
    (f) => f.severity === "suggestion" || f.severity === "info",
  ).length;
  const patternCount = inputs.reduce((s, i) => s + i.patterns.length, 0);

  const summary =
    `Analyzed ${inputs.length} model(s) with ${patternCount} access pattern(s). ` +
    `Found ${errorCount} error(s), ${warnCount} warning(s), ${suggestionCount} suggestion(s). ` +
    `Estimated total: ~${Math.round(totalRU)} RU/s (~$${totalMonthlyCost.toFixed(2)}/month).`;

  return {
    findings,
    ruEstimates,
    costBreakdowns,
    designPatternRecommendations: patternRecs,
    summary,
  };
}

function addPatternRec(
  recs: DesignPatternRecommendation[],
  seen: Set<string>,
  pattern: Parameters<typeof recommendPattern>[0],
  reason: string,
): void {
  if (seen.has(pattern)) return;
  seen.add(pattern);
  recs.push(recommendPattern(pattern, reason));
}
