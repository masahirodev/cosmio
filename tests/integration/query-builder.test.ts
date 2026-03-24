import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModel } from "../../src/model/define-model.js";
import { ensureContainer } from "../../src/utils/container-setup.js";
import { createTestClient } from "./setup.js";

const TaskModel = defineModel({
  name: "Task",
  container: "test-query-builder",
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

  const seeds = [
    {
      id: "qb-t1",
      projectId: "qb-p1",
      title: "Fix bug",
      priority: 3,
      status: "open" as const,
      createdAt: "2025-01-01",
    },
    {
      id: "qb-t2",
      projectId: "qb-p1",
      title: "Add feature",
      priority: 1,
      status: "open" as const,
      createdAt: "2025-01-02",
    },
    {
      id: "qb-t3",
      projectId: "qb-p1",
      title: "Fix typo",
      priority: 2,
      status: "closed" as const,
      createdAt: "2025-01-03",
    },
    {
      id: "qb-t4",
      projectId: "qb-p1",
      title: "Update docs",
      priority: 1,
      status: "open" as const,
      createdAt: "2025-01-04",
    },
    {
      id: "qb-t5",
      projectId: "qb-p2",
      title: "Deploy",
      priority: 5,
      status: "open" as const,
      createdAt: "2025-01-05",
    },
  ];

  beforeAll(async () => {
    await ensureContainer(client.database, TaskModel);
  }, 60_000);

  /** Helper: seed data for a test and return cleanup function */
  async function seedAndCleanup() {
    for (const seed of seeds) {
      await tasks.upsert(seed);
    }
    return async () => {
      for (const seed of seeds) {
        try {
          await tasks.delete(seed.id, [seed.projectId]);
        } catch {}
      }
    };
  }

  it("find all within a partition", async () => {
    const cleanup = await seedAndCleanup();
    try {
      const results = await tasks.find(["qb-p1"]).exec();
      expect(results).toHaveLength(4);
    } finally {
      await cleanup();
    }
  });

  it("where with equality", async () => {
    const cleanup = await seedAndCleanup();
    try {
      const results = await tasks.find(["qb-p1"]).where("status", "=", "closed").exec();
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("qb-t3");
    } finally {
      await cleanup();
    }
  });

  it("where with CONTAINS", async () => {
    const cleanup = await seedAndCleanup();
    try {
      const results = await tasks.find(["qb-p1"]).where("title", "CONTAINS", "Fix").exec();
      expect(results).toHaveLength(2);
    } finally {
      await cleanup();
    }
  });

  it("where with comparison operator", async () => {
    const cleanup = await seedAndCleanup();
    try {
      const results = await tasks.find(["qb-p1"]).where("priority", ">=", 2).exec();
      expect(results).toHaveLength(2); // priority 3 and 2
    } finally {
      await cleanup();
    }
  });

  it("orderBy ascending", async () => {
    const cleanup = await seedAndCleanup();
    try {
      const results = await tasks.find(["qb-p1"]).orderBy("priority", "ASC").exec();
      expect(results[0]!.priority).toBeLessThanOrEqual(results[1]!.priority);
    } finally {
      await cleanup();
    }
  });

  it("orderBy descending", async () => {
    const cleanup = await seedAndCleanup();
    try {
      const results = await tasks.find(["qb-p1"]).orderBy("createdAt", "DESC").exec();
      expect(results[0]!.createdAt).toBe("2025-01-04");
    } finally {
      await cleanup();
    }
  });

  it("limit restricts result count", async () => {
    const cleanup = await seedAndCleanup();
    try {
      const results = await tasks.find(["qb-p1"]).limit(2).exec();
      expect(results).toHaveLength(2);
    } finally {
      await cleanup();
    }
  });

  it("combined where + orderBy + limit", async () => {
    const cleanup = await seedAndCleanup();
    try {
      const results = await tasks
        .find(["qb-p1"])
        .where("status", "=", "open")
        .orderBy("priority", "DESC")
        .limit(2)
        .exec();

      expect(results).toHaveLength(2);
      expect(results[0]!.priority).toBeGreaterThanOrEqual(results[1]!.priority);
    } finally {
      await cleanup();
    }
  });

  it("raw query works", async () => {
    const cleanup = await seedAndCleanup();
    try {
      const results = await tasks.query(
        {
          query: "SELECT * FROM c WHERE c.projectId = @pid",
          parameters: [{ name: "@pid", value: "qb-p2" }],
        },
        ["qb-p2"],
      );
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe("Deploy");
    } finally {
      await cleanup();
    }
  });
});
