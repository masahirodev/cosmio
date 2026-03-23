/**
 * Orchestrator: connect → sample → infer → codegen.
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CosmioConnectionConfig, PullTarget } from "../config/define-config.js";
import { generateModelSource, toPascalCase } from "./codegen.js";
import { inferSchema } from "./infer-schema.js";
import { sampleContainer } from "./sample.js";

export interface PullResult {
  container: string;
  modelName: string;
  source: string;
  outputPath: string | undefined;
}

/**
 * Pull models from one or more Cosmos DB containers.
 */
export async function pull(
  connection: CosmioConnectionConfig,
  targets: PullTarget[],
): Promise<PullResult[]> {
  const results: PullResult[] = [];

  for (const target of targets) {
    const sampleSize = target.sampleSize ?? 100;
    const modelName = target.name ?? toPascalCase(target.container);

    console.error(
      `Pulling "${target.container}"${target.where ? ` (WHERE ${target.where})` : ""}...`,
    );

    const { metadata, documents } = await sampleContainer(
      connection,
      target.container,
      sampleSize,
      target.where,
    );

    if (documents.length === 0) {
      console.error(
        `  Warning: No documents found in "${target.container}". Generating skeleton model.`,
      );
    } else {
      console.error(`  Sampled ${documents.length} document(s).`);
    }

    const schema = inferSchema(documents, {
      enumThreshold: target.enumThreshold ?? 10,
    });

    // If empty, add id + partition key fields as skeleton
    if (documents.length === 0) {
      schema.fields.id = { type: { kind: "string" }, optional: false, nullable: false };
      for (const pkPath of metadata.partitionKeyPaths) {
        const field = pkPath.startsWith("/") ? pkPath.slice(1) : pkPath;
        schema.fields[field] = { type: { kind: "string" }, optional: false, nullable: false };
      }
    }

    const source = generateModelSource({
      modelName,
      containerName: target.container,
      partitionKeyPaths: metadata.partitionKeyPaths,
      schema,
      metadata,
    });

    if (target.output) {
      const outputPath = resolve(target.output);
      await writeFile(outputPath, source, "utf-8");
      console.error(`  → ${outputPath}`);
    }

    results.push({
      container: target.container,
      modelName,
      source,
      outputPath: target.output,
    });
  }

  return results;
}
