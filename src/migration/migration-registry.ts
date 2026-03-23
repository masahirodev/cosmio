/**
 * A single migration step. Transforms a raw document in-place.
 */
export interface Migration {
  /** Unique migration name (e.g. "v2-add-fullName", "v3-rename-status") */
  name: string;
  /**
   * Version number. Migrations are applied in ascending order.
   * Documents with `_schemaVersion >= version` skip this migration.
   */
  version: number;
  /** Which containers or models this migration applies to. Omit for all. */
  scope?: {
    containers?: string[];
    models?: string[];
  };
  /** Transform the raw document. Mutate and return it. */
  up: (doc: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Global migration registry.
 * Define all migrations in one place — they are automatically applied
 * to every read across all models.
 *
 * @example
 * ```ts
 * import { MigrationRegistry } from "cosmio";
 *
 * const migrations = new MigrationRegistry({ versionField: "_v" });
 *
 * migrations.register({
 *   name: "v2-add-fullName",
 *   version: 2,
 *   up: (doc) => {
 *     if (doc.firstName && !doc.fullName) {
 *       doc.fullName = `${doc.firstName} ${doc.lastName}`;
 *       delete doc.firstName;
 *       delete doc.lastName;
 *     }
 *     return doc;
 *   },
 * });
 *
 * migrations.register({
 *   name: "v3-default-role",
 *   version: 3,
 *   up: (doc) => {
 *     if (!doc.role) doc.role = "member";
 *     return doc;
 *   },
 * });
 *
 * // Pass to CosmioClient — all reads auto-migrate
 * const client = new CosmioClient({
 *   cosmos: { endpoint: "...", key: "..." },
 *   database: "mydb",
 *   migrations,
 * });
 * ```
 */
export class MigrationRegistry {
  private readonly _migrations: Migration[] = [];
  private readonly _versionField: string;
  private _sorted = false;

  constructor(options?: {
    /** Document field used to track schema version. Defaults to "_schemaVersion". */
    versionField?: string;
  }) {
    this._versionField = options?.versionField ?? "_schemaVersion";
  }

  /** The field name used to track schema version on documents. */
  get versionField(): string {
    return this._versionField;
  }

  /** The current latest version (highest registered migration version). */
  get currentVersion(): number {
    if (this._migrations.length === 0) return 0;
    this._ensureSorted();
    return this._migrations[this._migrations.length - 1]!.version;
  }

  /** All registered migrations, sorted by version ascending. */
  get migrations(): readonly Migration[] {
    this._ensureSorted();
    return this._migrations;
  }

  /**
   * Register a migration.
   */
  register(migration: Migration): this {
    // Check for duplicate version
    const existing = this._migrations.find((m) => m.version === migration.version);
    if (existing) {
      throw new Error(
        `Migration version ${migration.version} already registered as "${existing.name}". ` +
          `Cannot register "${migration.name}" with the same version.`,
      );
    }
    this._migrations.push(migration);
    this._sorted = false;
    return this;
  }

  /**
   * Apply applicable migrations to a raw document.
   * Returns the migrated document with updated version field.
   *
   * @param doc - The raw document from Cosmos DB
   * @param context - Container name and model name for scope filtering
   */
  apply(
    doc: Record<string, unknown>,
    context?: { container?: string; model?: string },
  ): Record<string, unknown> {
    this._ensureSorted();

    const docVersion =
      typeof doc[this._versionField] === "number" ? (doc[this._versionField] as number) : 0;

    let result = doc;
    let highestApplied = docVersion;

    for (const migration of this._migrations) {
      // Skip already-applied migrations
      if (migration.version <= docVersion) continue;

      // Check scope filter — skip if scope is defined but context is missing or doesn't match
      if (migration.scope) {
        if (migration.scope.containers) {
          if (!context?.container || !migration.scope.containers.includes(context.container)) {
            continue;
          }
        }
        if (migration.scope.models) {
          if (!context?.model || !migration.scope.models.includes(context.model)) {
            continue;
          }
        }
      }

      result = migration.up(result);
      highestApplied = migration.version;
    }

    // Stamp the version so subsequent reads know where this document is at
    if (highestApplied > docVersion) {
      result[this._versionField] = highestApplied;
    }

    return result;
  }

  private _ensureSorted(): void {
    if (!this._sorted) {
      this._migrations.sort((a, b) => a.version - b.version);
      this._sorted = true;
    }
  }
}
