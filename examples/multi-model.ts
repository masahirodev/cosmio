/**
 * Multi-model example: Multiple models in a single container (single-table design).
 *
 * Run with: npx tsx examples/multi-model.ts
 */
import { z } from "zod";
import { CosmioClient, defineModel, ensureContainer } from "../src/index.js";

// Two models sharing the same container, distinguished by "type"
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
    body: z.string(),
    publishedAt: z.number(),
  }),
  defaults: {
    type: "article",
    publishedAt: () => Math.floor(Date.now() / 1000),
  },
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
    articleId: z.string(),
    body: z.string(),
    createdAt: z.number(),
  }),
  defaults: {
    type: "comment",
    createdAt: () => Math.floor(Date.now() / 1000),
  },
});

const client = new CosmioClient({
  cosmos: { endpoint: "https://localhost:8081", key: "your-key" },
  database: "example-db",
});

async function main() {
  // Both models use the same container
  await ensureContainer(client.database, ArticleModel);

  const articles = client.model(ArticleModel);
  const comments = client.model(CommentModel);

  // Create article
  await articles.create({
    id: "art-1",
    tenantId: "acme",
    title: "Getting Started with Cosmos DB",
    body: "...",
  });

  // Create comment — type is auto-filled by defaults
  await comments.create({
    id: "cmt-1",
    tenantId: "acme",
    articleId: "art-1",
    body: "Great article!",
  });

  // Query articles — discriminator auto-filters, comments are excluded
  const articleList = await articles.find(["acme"]).exec();
  console.log("Articles:", articleList.length); // 1

  // Query comments — only comments returned
  const commentList = await comments.find(["acme"]).exec();
  console.log("Comments:", commentList.length); // 1
}

main().catch(console.error);
