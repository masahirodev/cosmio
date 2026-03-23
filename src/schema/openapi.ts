import type { z } from "zod";
import type { ModelDefinition } from "../model/model-types.js";
import { toJsonSchema } from "./json-schema.js";

interface OpenAPIDocument {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, unknown>;
  components: {
    schemas: Record<string, unknown>;
  };
}

interface OpenAPIOptions {
  /** API title */
  title?: string;
  /** API version */
  version?: string;
  /** Generate CRUD paths for each model */
  generatePaths?: boolean;
}

/**
 * Generate an OpenAPI 3.1 document fragment from model definitions.
 */
export function toOpenAPI(
  models: ModelDefinition<z.ZodObject<z.ZodRawShape>, readonly [string, ...string[]]>[],
  options: OpenAPIOptions = {},
): OpenAPIDocument {
  const { title = "Cosmio API", version = "1.0.0", generatePaths = false } = options;

  const schemas: Record<string, unknown> = {};
  const paths: Record<string, unknown> = {};

  for (const model of models) {
    const jsonSchema = toJsonSchema(model);
    // Remove top-level meta fields not valid in OpenAPI component schemas
    const { $schema: _$schema, title: schemaTitle, ...rest } = jsonSchema;
    schemas[model.name] = { title: schemaTitle, ...rest };

    if (generatePaths) {
      const basePath = `/${model.container}`;
      const ref = `#/components/schemas/${model.name}`;

      paths[basePath] = {
        get: {
          summary: `List ${model.name} documents`,
          operationId: `list${model.name}`,
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: ref },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: `Create a ${model.name} document`,
          operationId: `create${model.name}`,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: ref },
              },
            },
          },
          responses: {
            "201": {
              description: "Created",
              content: {
                "application/json": {
                  schema: { $ref: ref },
                },
              },
            },
          },
        },
      };

      paths[`${basePath}/{id}`] = {
        get: {
          summary: `Get a ${model.name} document by ID`,
          operationId: `get${model.name}`,
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: { $ref: ref },
                },
              },
            },
            "404": { description: "Not found" },
          },
        },
        put: {
          summary: `Replace a ${model.name} document`,
          operationId: `replace${model.name}`,
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: ref },
              },
            },
          },
          responses: {
            "200": {
              description: "Replaced",
              content: {
                "application/json": {
                  schema: { $ref: ref },
                },
              },
            },
          },
        },
        delete: {
          summary: `Delete a ${model.name} document`,
          operationId: `delete${model.name}`,
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "204": { description: "Deleted" },
          },
        },
      };
    }
  }

  return {
    openapi: "3.1.0",
    info: { title, version },
    paths,
    components: { schemas },
  };
}
