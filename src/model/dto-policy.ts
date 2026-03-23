import type { z } from "zod";
import type { DefaultsMap, DtoMap, ModelDefinition } from "./model-types.js";

/**
 * Per-model override for the global DTO policy.
 */
export interface DtoModelOverride {
  /**
   * Fields from globalOmit to re-include for this model.
   * Overrides the global omit — these fields will NOT be stripped.
   */
  include?: readonly string[];
  /**
   * Additional fields to omit for this model on top of globalOmit.
   */
  omit?: readonly string[];
}

/**
 * Project-wide DTO policy configuration.
 */
export interface DtoPolicyConfig {
  /**
   * Fields to always omit from every DTO across all models.
   * Applied on top of each model's own DTO rules.
   *
   * @example
   * ```ts
   * globalOmit: ["_rid", "_self", "_ts", "_etag"]
   * ```
   */
  globalOmit: readonly string[];
  /**
   * Per-model overrides keyed by model name.
   * Use `include` to exempt a model from specific globalOmit fields,
   * or `omit` to add extra fields to strip for that model.
   *
   * @example
   * ```ts
   * overrides: {
   *   AuditLog: { include: ["_ts"] },         // keep _ts for this model
   *   Session:  { omit: ["sessionToken"] },   // additionally strip sessionToken
   * }
   * ```
   */
  overrides?: Record<string, DtoModelOverride>;
}

/**
 * A project-wide DTO policy that enforces global field omission
 * on top of model-specific DTO rules, with per-model overrides.
 */
export class DtoPolicy {
  private readonly _globalOmit: ReadonlySet<string>;
  private readonly _overrides: Record<string, DtoModelOverride>;
  /** Pre-computed effective omit sets per model (lazy) */
  private readonly _resolved = new Map<string, ReadonlySet<string>>();

  constructor(config: DtoPolicyConfig) {
    this._globalOmit = new Set(config.globalOmit);
    this._overrides = config.overrides ?? {};
  }

  /**
   * Get the effective omit set for a given model name.
   * Merges globalOmit with per-model include/omit overrides.
   */
  private _resolveForModel(modelName: string): ReadonlySet<string> {
    const cached = this._resolved.get(modelName);
    if (cached) return cached;

    const override = this._overrides[modelName];
    if (!override) {
      this._resolved.set(modelName, this._globalOmit);
      return this._globalOmit;
    }

    const effective = new Set(this._globalOmit);

    // Remove fields that this model wants to keep
    if (override.include) {
      for (const field of override.include) {
        effective.delete(field);
      }
    }
    // Add extra fields to omit for this model
    if (override.omit) {
      for (const field of override.omit) {
        effective.add(field);
      }
    }

    const frozen: ReadonlySet<string> = effective;
    this._resolved.set(modelName, frozen);
    return frozen;
  }

  /**
   * Convert a document using the model's named DTO, then apply
   * global + per-model omit rules.
   *
   * @example
   * ```ts
   * const policy = defineDtoPolicy({
   *   globalOmit: ["_rid", "_self", "_ts", "_etag"],
   *   overrides: {
   *     AuditLog: { include: ["_ts"] },
   *   },
   * });
   * const apiUser = policy.apply(UserModel, "api", rawDoc);
   * ```
   */
  apply<
    TSchema extends z.ZodObject<z.ZodRawShape>,
    TPaths extends readonly [string, ...string[]],
    TDefaults extends DefaultsMap<TSchema>,
    TDtoMap extends DtoMap<TSchema>,
    K extends string & keyof TDtoMap,
  >(
    model: ModelDefinition<TSchema, TPaths, TDefaults, TDtoMap>,
    name: K,
    doc: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = model.toDto(name, doc) as Record<string, unknown>;
    const omitSet = this._resolveForModel(model.name);
    for (const field of omitSet) {
      delete result[field];
    }
    return result;
  }

  /**
   * Strip the global + per-model omit fields from a document
   * (without applying any model DTO).
   */
  strip(doc: Record<string, unknown>, modelName?: string): Record<string, unknown> {
    const result = { ...doc };
    const omitSet = modelName ? this._resolveForModel(modelName) : this._globalOmit;
    for (const field of omitSet) {
      delete result[field];
    }
    return result;
  }

  /** The set of globally omitted field names */
  get globalOmit(): ReadonlySet<string> {
    return this._globalOmit;
  }

  /** Get the effective omit set for a specific model */
  resolvedOmitFor(modelName: string): ReadonlySet<string> {
    return this._resolveForModel(modelName);
  }
}

/**
 * Create a project-wide DTO policy for consistent field omission across all models.
 *
 * @example
 * ```ts
 * export const dtoPolicy = defineDtoPolicy({
 *   globalOmit: ["_rid", "_self", "_ts", "_etag"],
 *   overrides: {
 *     AuditLog: { include: ["_ts"] },
 *     Session:  { omit: ["sessionToken"] },
 *   },
 * });
 *
 * // AuditLog keeps _ts, Session additionally strips sessionToken
 * const apiLog = dtoPolicy.apply(AuditLogModel, "api", rawDoc);
 * const apiSession = dtoPolicy.apply(SessionModel, "api", rawDoc);
 * ```
 */
export function defineDtoPolicy(config: DtoPolicyConfig): DtoPolicy {
  return new DtoPolicy(config);
}
