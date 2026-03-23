import { describe, expect, it } from "vitest";
import { MigrationRegistry } from "../../src/migration/migration-registry.js";

describe("MigrationRegistry", () => {
  it("applies migrations in version order", () => {
    const registry = new MigrationRegistry();

    // Register out of order
    registry.register({
      name: "v3-add-role",
      version: 3,
      up: (doc) => {
        if (!doc.role) doc.role = "member";
        return doc;
      },
    });

    registry.register({
      name: "v2-merge-name",
      version: 2,
      up: (doc) => {
        if (doc.firstName && !doc.fullName) {
          doc.fullName = `${doc.firstName} ${doc.lastName}`;
          delete doc.firstName;
          delete doc.lastName;
        }
        return doc;
      },
    });

    const doc = { id: "u1", firstName: "Taro", lastName: "Yamada" };
    const result = registry.apply(doc);

    expect(result.fullName).toBe("Taro Yamada");
    expect(result.role).toBe("member");
    expect(result.firstName).toBeUndefined();
    expect(result._schemaVersion).toBe(3);
  });

  it("skips already-migrated documents", () => {
    const registry = new MigrationRegistry();
    let callCount = 0;

    registry.register({
      name: "v2",
      version: 2,
      up: (doc) => {
        callCount++;
        return doc;
      },
    });

    registry.apply({ id: "u1", _schemaVersion: 2 });
    expect(callCount).toBe(0);

    registry.apply({ id: "u2", _schemaVersion: 1 });
    expect(callCount).toBe(1);
  });

  it("supports custom version field", () => {
    const registry = new MigrationRegistry({ versionField: "_v" });

    registry.register({
      name: "v1",
      version: 1,
      up: (doc) => {
        doc.migrated = true;
        return doc;
      },
    });

    const result = registry.apply({ id: "u1" });
    expect(result._v).toBe(1);
    expect(result.migrated).toBe(true);
  });

  it("scopes migrations to specific containers", () => {
    const registry = new MigrationRegistry();

    registry.register({
      name: "v1-users-only",
      version: 1,
      scope: { containers: ["users"] },
      up: (doc) => {
        doc.userMigrated = true;
        return doc;
      },
    });

    const userDoc = registry.apply({ id: "u1" }, { container: "users" });
    expect(userDoc.userMigrated).toBe(true);

    const otherDoc = registry.apply({ id: "p1" }, { container: "posts" });
    expect(otherDoc.userMigrated).toBeUndefined();
  });

  it("scopes migrations to specific models", () => {
    const registry = new MigrationRegistry();

    registry.register({
      name: "v1-article-only",
      version: 1,
      scope: { models: ["Article"] },
      up: (doc) => {
        doc.articleMigrated = true;
        return doc;
      },
    });

    const article = registry.apply({ id: "a1" }, { model: "Article" });
    expect(article.articleMigrated).toBe(true);

    const comment = registry.apply({ id: "c1" }, { model: "Comment" });
    expect(comment.articleMigrated).toBeUndefined();
  });

  it("throws on duplicate version", () => {
    const registry = new MigrationRegistry();
    registry.register({ name: "v1", version: 1, up: (d) => d });

    expect(() => registry.register({ name: "v1-dup", version: 1, up: (d) => d })).toThrow(
      "version 1 already registered",
    );
  });

  it("reports currentVersion", () => {
    const registry = new MigrationRegistry();
    expect(registry.currentVersion).toBe(0);

    registry.register({ name: "v3", version: 3, up: (d) => d });
    registry.register({ name: "v1", version: 1, up: (d) => d });

    expect(registry.currentVersion).toBe(3);
  });

  it("does not stamp version if no migrations applied", () => {
    const registry = new MigrationRegistry();
    registry.register({ name: "v1", version: 1, up: (d) => d });

    const result = registry.apply({ id: "u1", _schemaVersion: 1 });
    // Version should not change — no migrations ran
    expect(result._schemaVersion).toBe(1);
  });
});
