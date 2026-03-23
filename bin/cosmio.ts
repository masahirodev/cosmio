#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { z } from "zod";
import type { CosmioConnectionConfig, PullTarget } from "../src/config/define-config.js";
import { loadConfig } from "../src/config/load-config.js";
import { pull } from "../src/introspect/pull.js";
import type { ModelDefinition } from "../src/model/model-types.js";
import { toJsonSchemas } from "../src/schema/json-schema.js";
import { toMarkdownDoc } from "../src/schema/markdown.js";
import { toMermaidER } from "../src/schema/mermaid.js";
import { toOpenAPI } from "../src/schema/openapi.js";

type AnyModelDefinition = ModelDefinition<
  z.ZodObject<z.ZodRawShape>,
  readonly [string, ...string[]]
>;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "pull") {
    await handlePull(args.slice(1));
  } else if (command === "docs") {
    await handleDocs(args.slice(1));
  } else {
    printUsage();
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// pull command
// ---------------------------------------------------------------------------

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const arg of args) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      result[match[1]!] = match[2]!;
    } else if (arg.startsWith("--")) {
      // Boolean flag (e.g., --disable-tls)
      result[arg.slice(2)] = "true";
    }
  }
  return result;
}

async function handlePull(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help === "true") {
    console.error("Usage: cosmio pull [options]");
    console.error("");
    console.error("Generate model definitions from Cosmos DB containers.");
    console.error("Reads cosmio.config.ts if present, or use CLI args / env vars.");
    console.error("");
    console.error("Connection:");
    console.error("  --endpoint=<url>           Cosmos DB endpoint (or COSMOS_ENDPOINT)");
    console.error("  --key=<key>                Cosmos DB key (or COSMOS_KEY)");
    console.error("  --connection-string=<str>   Connection string (or COSMOS_CONNECTION_STRING)");
    console.error("  --database=<name>          Database name (or COSMOS_DATABASE)");
    console.error("  --disable-tls              Disable TLS verification (emulator)");
    console.error("");
    console.error("Target:");
    console.error("  --container=<name>         Container to pull (required without config)");
    console.error("  --name=<ModelName>         Model name (default: PascalCase of container)");
    console.error("  --output=<path>            Output file (default: stdout)");
    console.error("  --sample-size=<n>          Documents to sample (default: 100)");
    console.error("  --where=<expr>             Filter for multi-model containers");
    console.error("  --enum-threshold=<n>       Max distinct values for enum (default: 10)");
    console.error("");
    console.error("Examples:");
    console.error("  cosmio pull                                  # all targets from config");
    console.error("  cosmio pull --container=users                # single container from config");
    console.error("  cosmio pull --container=users --output=u.ts  # without config");
    console.error("  cosmio pull --container=docs --where=\"c.type = 'article'\" --name=Article");
    console.error("  dotenvx run -- cosmio pull                   # with dotenvx");
    return;
  }

  // Load config file
  const config = await loadConfig();

  // Resolve connection: CLI args > config > env vars
  const connection = stripUndefined({
    endpoint: parsed.endpoint ?? config?.connection.endpoint ?? process.env.COSMOS_ENDPOINT,
    key: parsed.key ?? config?.connection.key ?? process.env.COSMOS_KEY,
    connectionString:
      parsed["connection-string"] ??
      config?.connection.connectionString ??
      process.env.COSMOS_CONNECTION_STRING,
    database: parsed.database ?? config?.connection.database ?? process.env.COSMOS_DATABASE ?? "",
    disableTls: parsed["disable-tls"] === "true" || config?.connection.disableTls || false,
  }) as CosmioConnectionConfig;

  if (connection.disableTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  if (!connection.database) {
    console.error("Error: --database is required (or set in config / COSMOS_DATABASE env var)");
    process.exit(1);
  }

  // Resolve targets
  let targets: PullTarget[];

  if (parsed.container) {
    // Single container from CLI
    const configTarget = config?.pull?.find((t) => t.container === parsed.container);
    targets = [
      stripUndefined({
        container: parsed.container,
        name: parsed.name ?? configTarget?.name,
        output: parsed.output ?? configTarget?.output,
        sampleSize: parsed["sample-size"]
          ? Number.parseInt(parsed["sample-size"], 10)
          : configTarget?.sampleSize,
        where: parsed.where ?? configTarget?.where,
        enumThreshold: parsed["enum-threshold"]
          ? Number.parseInt(parsed["enum-threshold"], 10)
          : configTarget?.enumThreshold,
      }) as PullTarget,
    ];
  } else if (config?.pull && config.pull.length > 0) {
    // All targets from config
    targets = config.pull;
  } else {
    console.error("Error: Specify --container or define pull targets in cosmio.config.ts");
    process.exit(1);
  }

  const results = await pull(connection, targets);

  // Print to stdout if no output path was set
  for (const result of results) {
    if (!result.outputPath) {
      console.log(result.source);
    }
  }

  console.error(`Done. Generated ${results.length} model(s).`);
}

// ---------------------------------------------------------------------------
// docs command (existing)
// ---------------------------------------------------------------------------

async function handleDocs(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.error("Usage: cosmio docs --format=<format> [--output=<file>] <glob...>");
    console.error("Formats: markdown, json-schema, openapi, mermaid");
    process.exit(1);
  }

  let format = "markdown";
  let outputPath: string | undefined;
  const filePaths: string[] = [];

  for (const arg of args) {
    if (arg.startsWith("--format=")) {
      format = arg.slice("--format=".length);
    } else if (arg.startsWith("--output=")) {
      outputPath = arg.slice("--output=".length);
    } else {
      filePaths.push(arg);
    }
  }

  if (filePaths.length === 0) {
    console.error("Error: No input files specified");
    process.exit(1);
  }

  const models: AnyModelDefinition[] = [];

  for (const filePath of filePaths) {
    const absPath = resolve(filePath);
    const fileUrl = pathToFileURL(absPath).href;
    const mod = await import(fileUrl);

    for (const exportValue of Object.values(mod)) {
      if (isModelDefinition(exportValue)) {
        models.push(exportValue);
      }
    }
  }

  if (models.length === 0) {
    console.error("No ModelDefinition exports found in the specified files");
    process.exit(1);
  }

  console.error(`Found ${models.length} model(s): ${models.map((m) => m.name).join(", ")}`);

  let output: string;
  switch (format) {
    case "markdown":
      output = toMarkdownDoc(models);
      break;
    case "json-schema":
      output = JSON.stringify(toJsonSchemas(models), null, 2);
      break;
    case "openapi": {
      const doc = toOpenAPI(models, { generatePaths: true });
      if (outputPath && extname(outputPath) === ".yaml") {
        output = JSON.stringify(doc, null, 2);
        console.error("Note: YAML output requires a YAML serializer. Outputting JSON.");
      } else {
        output = JSON.stringify(doc, null, 2);
      }
      break;
    }
    case "mermaid":
      output = toMermaidER(models);
      break;
    default:
      console.error(`Unknown format: ${format}`);
      process.exit(1);
  }

  if (outputPath) {
    await writeFile(resolve(outputPath), output, "utf-8");
    console.error(`Written to ${outputPath}`);
  } else {
    console.log(output);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isModelDefinition(value: unknown): value is AnyModelDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "container" in value &&
    "partitionKey" in value &&
    "schema" in value &&
    typeof (value as AnyModelDefinition).name === "string" &&
    Array.isArray((value as AnyModelDefinition).partitionKey)
  );
}

/** Remove keys with undefined values so they don't violate exactOptionalPropertyTypes */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value;
  }
  return result as T;
}

function printUsage(): void {
  console.error("Usage:");
  console.error("  cosmio pull [options]       Generate models from Cosmos DB");
  console.error("  cosmio docs [options] files  Generate documentation from models");
  console.error("");
  console.error("Run 'cosmio pull --help' or 'cosmio docs --help' for details.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
