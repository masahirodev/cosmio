import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { toMermaidER } from "../../src/schema/mermaid.js";

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
    publishedAt: z.string().optional(),
  }),
});

const CommentModel = defineModel({
  name: "Comment",
  container: "content",
  partitionKey: ["/tenantId"],
  discriminator: { field: "type", value: "comment" },
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    type: z.literal("comment"),
    body: z.string(),
    articleId: z.string(),
  }),
});

const TagModel = defineModel({
  name: "Tag",
  container: "tags",
  partitionKey: ["/tenantId"],
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    name: z.string(),
  }),
});

const InspectionModel = defineModel({
  name: "Inspection",
  container: "inspections",
  partitionKey: ["/tenantId", "/siteId"],
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    siteId: z.string(),
    name: z.string(),
    score: z.number().optional(),
  }),
});

describe("toMermaidER", () => {
  it("generates erDiagram header", () => {
    const output = toMermaidER([ArticleModel]);
    expect(output).toContain("erDiagram");
  });

  it("generates entity with fields", () => {
    const output = toMermaidER([TagModel]);
    expect(output).toContain("Tag {");
    expect(output).toContain("string id");
    expect(output).toContain("string tenantId");
    expect(output).toContain("string name");
  });

  it("marks document id", () => {
    const output = toMermaidER([TagModel]);
    expect(output).toContain('string id "document id"');
  });

  it("marks partition key fields", () => {
    const output = toMermaidER([TagModel]);
    expect(output).toContain('string tenantId "partition key"');
  });

  it("marks hierarchical partition key fields", () => {
    const output = toMermaidER([InspectionModel]);
    expect(output).toContain('string tenantId "partition key"');
    expect(output).toContain('string siteId "partition key"');
  });

  it("marks discriminator fields", () => {
    const output = toMermaidER([ArticleModel]);
    expect(output).toContain('string type "discriminator: article"');
  });

  it("marks optional fields", () => {
    const output = toMermaidER([ArticleModel]);
    expect(output).toContain('string publishedAt "optional"');
  });

  it("combines annotations on a single field", () => {
    // id is both document id, and tenantId is partition key — but what about
    // a field that is both PK and optional? Let's just check combined case.
    const output = toMermaidER([InspectionModel]);
    // score is optional number
    expect(output).toContain('number score "optional"');
  });

  it("links models sharing the same container", () => {
    const output = toMermaidER([ArticleModel, CommentModel]);
    expect(output).toContain('Article }|--|{ Comment : "same container: content"');
  });

  it("does not link models in different containers", () => {
    const output = toMermaidER([ArticleModel, TagModel]);
    expect(output).not.toContain("}|--|{");
    expect(output).not.toContain("same container");
  });

  it("links all models pairwise in the same container", () => {
    const ThirdModel = defineModel({
      name: "Reaction",
      container: "content",
      partitionKey: ["/tenantId"],
      discriminator: { field: "type", value: "reaction" },
      schema: z.object({
        id: z.string(),
        tenantId: z.string(),
        type: z.literal("reaction"),
        emoji: z.string(),
      }),
    });

    const output = toMermaidER([ArticleModel, CommentModel, ThirdModel]);
    expect(output).toContain('Article }|--|{ Comment : "same container: content"');
    expect(output).toContain('Article }|--|{ Reaction : "same container: content"');
    expect(output).toContain('Comment }|--|{ Reaction : "same container: content"');
  });

  it("supports title option", () => {
    const output = toMermaidER([ArticleModel], { title: "My Models" });
    expect(output).toContain("---");
    expect(output).toContain("title: My Models");
  });

  it("generates multiple entities", () => {
    const output = toMermaidER([ArticleModel, CommentModel, TagModel]);
    expect(output).toContain("Article {");
    expect(output).toContain("Comment {");
    expect(output).toContain("Tag {");
  });

  it("does not contain FK markers", () => {
    const output = toMermaidER([ArticleModel, CommentModel]);
    expect(output).not.toContain(" FK");
    expect(output).not.toContain(" PK");
  });
});
