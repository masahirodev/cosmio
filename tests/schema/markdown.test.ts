import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { toMarkdown, toMarkdownDoc } from "../../src/schema/markdown.js";

const UserModel = defineModel({
  name: "User",
  container: "users",
  partitionKey: ["/tenantId"],
  schema: z.object({
    id: z.string(),
    tenantId: z.string(),
    name: z.string(),
    age: z.number().optional(),
    type: z.literal("user"),
  }),
  description: "A user document",
});

describe("toMarkdown", () => {
  it("generates markdown with model info", () => {
    const md = toMarkdown(UserModel);

    expect(md).toContain("## User");
    expect(md).toContain("A user document");
    expect(md).toContain("`users`");
    expect(md).toContain("`/tenantId`");
  });

  it("generates a field table", () => {
    const md = toMarkdown(UserModel);

    expect(md).toContain("| Field | Type | Required | Description |");
    expect(md).toContain("| `id` | string | Yes |");
    expect(md).toContain("| `age` | number | No |");
    expect(md).toContain("| `type` |");
  });

  it("shows discriminator info when present", () => {
    const model = defineModel({
      name: "TypedDoc",
      container: "docs",
      partitionKey: ["/tenantId"],
      discriminator: { field: "type", value: "typed" },
      schema: z.object({
        id: z.string(),
        tenantId: z.string(),
        type: z.literal("typed"),
      }),
    });

    const md = toMarkdown(model);
    expect(md).toContain("Discriminator");
    expect(md).toContain('"typed"');
  });
});

describe("toMarkdownDoc", () => {
  it("generates combined documentation", () => {
    const model2 = defineModel({
      name: "Post",
      container: "posts",
      partitionKey: ["/userId"],
      schema: z.object({
        id: z.string(),
        userId: z.string(),
        title: z.string(),
      }),
    });

    const md = toMarkdownDoc([UserModel, model2], {
      title: "My Models",
    });

    expect(md).toContain("# My Models");
    expect(md).toContain("## User");
    expect(md).toContain("## Post");
  });
});
