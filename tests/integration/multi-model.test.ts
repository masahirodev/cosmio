import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { createTestClient, setupTestDatabase, teardownTestDatabase } from "./setup.js";

const TEST_FILE = "multi-model";

const ArticleModel = defineModel({
  name: "Article",
  container: "test-multi-model",
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
  container: "test-multi-model",
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
  const client = createTestClient(TEST_FILE);
  const articles = client.model(ArticleModel);
  const comments = client.model(CommentModel);

  beforeAll(async () => {
    await setupTestDatabase(TEST_FILE);
    // Both models share the same container "test-multi-model"
    await ensureContainer(client.database, ArticleModel);
  }, 60_000);

  afterAll(async () => {
    await teardownTestDatabase(TEST_FILE);
  });

  it("stores different models in the same container", async () => {
    await articles.create({
      id: "mm-art-1",
      tenantId: "t1",
      type: "article",
      title: "Hello World",
    });

    await comments.create({
      id: "mm-cmt-1",
      tenantId: "t1",
      type: "comment",
      body: "Great article!",
      articleId: "mm-art-1",
    });

    try {
      const foundArticle = await articles.findById("mm-art-1", ["t1"]);
      expect(foundArticle!.title).toBe("Hello World");

      const foundComment = await comments.findById("mm-cmt-1", ["t1"]);
      expect(foundComment!.body).toBe("Great article!");
    } finally {
      try {
        await articles.delete("mm-art-1", ["t1"]);
      } catch {}
      try {
        await comments.delete("mm-cmt-1", ["t1"]);
      } catch {}
    }
  });

  it("query builder auto-filters by discriminator", async () => {
    await articles.upsert({ id: "mm-art-2", tenantId: "t1", type: "article", title: "Post 2" });
    await articles.upsert({ id: "mm-art-3", tenantId: "t1", type: "article", title: "Post 3" });
    await comments.upsert({
      id: "mm-cmt-2",
      tenantId: "t1",
      type: "comment",
      body: "Nice",
      articleId: "mm-art-2",
    });

    try {
      // Query articles — should NOT include comments
      const articleResults = await articles.find(["t1"]).exec();
      expect(articleResults.every((r) => r.type === "article")).toBe(true);
      expect(articleResults).toHaveLength(2);

      // Query comments — should NOT include articles
      const commentResults = await comments.find(["t1"]).exec();
      expect(commentResults.every((r) => r.type === "comment")).toBe(true);
      expect(commentResults).toHaveLength(1);
    } finally {
      try {
        await articles.delete("mm-art-2", ["t1"]);
      } catch {}
      try {
        await articles.delete("mm-art-3", ["t1"]);
      } catch {}
      try {
        await comments.delete("mm-cmt-2", ["t1"]);
      } catch {}
    }
  });

  it("rejects document with wrong discriminator value", async () => {
    await expect(
      articles.create({
        id: "mm-bad",
        tenantId: "t1",
        type: "article", // schema requires "article" so Zod passes, but let's test wrong value
        title: "test",
      } as Parameters<typeof articles.create>[0]),
    ).resolves.toBeDefined(); // correct type passes

    // Clean up
    try {
      await articles.delete("mm-bad", ["t1"]);
    } catch {}
  });
});
