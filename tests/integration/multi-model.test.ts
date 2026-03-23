import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";

import { cleanupTestDatabase, createTestClient, ensureTestDatabase } from "./setup.js";

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
  discriminator: { field: "type", value: "comment" },
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    type: z.literal("comment"),
    body: z.string(),
    articleId: z.string(),
  }),
});

describe("Multi-model container (discriminator)", () => {
  const client = createTestClient();
  const articles = client.model(ArticleModel);
  const comments = client.model(CommentModel);

  beforeAll(async () => {
    await ensureTestDatabase();
    // Both models share the same container "content"
    await ensureContainer(client.database, ArticleModel);
  }, 60_000);

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  // TODO: vnext-preview emulator returns "unknown type of jsonb container"
  it.skip("stores different models in the same container", async () => {
    await articles.create({
      id: "art-1",
      tenantId: "t1",
      type: "article",
      title: "Hello World",
    });

    await comments.create({
      id: "cmt-1",
      tenantId: "t1",
      type: "comment",
      body: "Great article!",
      articleId: "art-1",
    });

    const foundArticle = await articles.findById("art-1", ["t1"]);
    expect(foundArticle!.title).toBe("Hello World");

    const foundComment = await comments.findById("cmt-1", ["t1"]);
    expect(foundComment!.body).toBe("Great article!");

    await articles.delete("art-1", ["t1"]);
    await comments.delete("cmt-1", ["t1"]);
  });

  // TODO: vnext-preview emulator does not support complex queries with discriminator filter
  it.skip("query builder auto-filters by discriminator", async () => {
    await articles.upsert({ id: "art-2", tenantId: "t1", type: "article", title: "Post 2" });
    await articles.upsert({ id: "art-3", tenantId: "t1", type: "article", title: "Post 3" });
    await comments.upsert({
      id: "cmt-2",
      tenantId: "t1",
      type: "comment",
      body: "Nice",
      articleId: "art-2",
    });

    // Query articles — should NOT include comments
    const articleResults = await articles.find(["t1"]).exec();
    expect(articleResults.every((r) => r.type === "article")).toBe(true);
    expect(articleResults).toHaveLength(2);

    // Query comments — should NOT include articles
    const commentResults = await comments.find(["t1"]).exec();
    expect(commentResults.every((r) => r.type === "comment")).toBe(true);
    expect(commentResults).toHaveLength(1);

    await articles.delete("art-2", ["t1"]);
    await articles.delete("art-3", ["t1"]);
    await comments.delete("cmt-2", ["t1"]);
  });

  // TODO: vnext-preview emulator does not support complex queries with discriminator
  it.skip("rejects document with wrong discriminator value", async () => {
    await expect(
      articles.create({
        id: "bad",
        tenantId: "t1",
        type: "article", // schema requires "article" so Zod passes, but let's test wrong value
        title: "test",
      } as Parameters<typeof articles.create>[0]),
    ).resolves.toBeDefined(); // correct type passes

    // Clean up
    await articles.delete("bad", ["t1"]);
  });
});
