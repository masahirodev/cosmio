import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { cleanupTestDatabase, createTestClient, ensureTestDatabase } from "./setup.js";

const TaskModel = defineModel({
  name: "Task",
  container: "tasks",
  partitionKey: ["/projectId"],
  schema: z.object({
    id: z.string(),
    projectId: z.string(),
    title: z.string(),
    priority: z.number(),
    status: z.enum(["open", "closed"]),
    createdAt: z.string(),
  }),
});

describe("Query Builder (integration)", () => {
  const client = createTestClient();
  const tasks = client.model(TaskModel);

  beforeAll(async () => {
    await ensureTestDatabase();
    await ensureContainer(client.database, TaskModel);

    // Seed data
    const seeds = [
      {
        id: "t1",
        projectId: "p1",
        title: "Fix bug",
        priority: 3,
        status: "open" as const,
        createdAt: "2025-01-01",
      },
      {
        id: "t2",
        projectId: "p1",
        title: "Add feature",
        priority: 1,
        status: "open" as const,
        createdAt: "2025-01-02",
      },
      {
        id: "t3",
        projectId: "p1",
        title: "Fix typo",
        priority: 2,
        status: "closed" as const,
        createdAt: "2025-01-03",
      },
      {
        id: "t4",
        projectId: "p1",
        title: "Update docs",
        priority: 1,
        status: "open" as const,
        createdAt: "2025-01-04",
      },
      {
        id: "t5",
        projectId: "p2",
        title: "Deploy",
        priority: 5,
        status: "open" as const,
        createdAt: "2025-01-05",
      },
    ];
    for (const seed of seeds) {
      await tasks.upsert(seed);
    }
  }, 60_000);

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  it("find all within a partition", async () => {
    const results = await tasks.find(["p1"]).exec();
    expect(results).toHaveLength(4);
  });

  it("where with equality", async () => {
    const results = await tasks.find(["p1"]).where("status", "=", "closed").exec();

    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("t3");
  });

  it("where with CONTAINS", async () => {
    const results = await tasks.find(["p1"]).where("title", "CONTAINS", "Fix").exec();

    expect(results).toHaveLength(2);
  });

  it("where with comparison operator", async () => {
    const results = await tasks.find(["p1"]).where("priority", ">=", 2).exec();

    expect(results).toHaveLength(2); // priority 3 and 2
  });

  it("orderBy ascending", async () => {
    const results = await tasks.find(["p1"]).orderBy("priority", "ASC").exec();

    expect(results[0]!.priority).toBeLessThanOrEqual(results[1]!.priority);
  });

  it("orderBy descending", async () => {
    const results = await tasks.find(["p1"]).orderBy("createdAt", "DESC").exec();

    expect(results[0]!.createdAt).toBe("2025-01-04");
  });

  it("limit restricts result count", async () => {
    const results = await tasks.find(["p1"]).limit(2).exec();
    expect(results).toHaveLength(2);
  });

  it("combined where + orderBy + limit", async () => {
    const results = await tasks
      .find(["p1"])
      .where("status", "=", "open")
      .orderBy("priority", "DESC")
      .limit(2)
      .exec();

    expect(results).toHaveLength(2);
    expect(results[0]!.priority).toBeGreaterThanOrEqual(results[1]!.priority);
  });

  it("raw query works", async () => {
    const results = await tasks.query(
      {
        query: "SELECT * FROM c WHERE c.projectId = @pid",
        parameters: [{ name: "@pid", value: "p2" }],
      },
      ["p2"],
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Deploy");
  });
});
