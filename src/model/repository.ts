import type { z } from "zod";
import type { CosmioContainer } from "../client/cosmio-container.js";
import type { DefaultsMap, ModelDefinition } from "./model-types.js";

/**
 * Define a repository with custom methods on top of a CosmioContainer.
 * Provides a clean place for business logic and reusable queries.
 *
 * **Note:** `scope()` on the returned repository creates a new `CosmioContainer`
 * that does NOT carry over custom methods. If you need scoped custom methods,
 * call the factory again: `const scoped = UserRepo(container.scope())`.
 *
 * @example
 * ```ts
 * const UserRepo = defineRepository(UserModel, (container) => ({
 *   findByEmail: (tenant: string, email: string) =>
 *     container.find([tenant]).where("email", "=", email).exec().then(r => r[0]),
 *
 *   findActive: (tenant: string) =>
 *     container.find([tenant]).where("status", "=", "active").exec(),
 *
 *   deactivate: async (id: string, tenant: string) => {
 *     await container.patch(id, [tenant], [{ op: "replace", path: "/status", value: "inactive" }]);
 *   },
 * }));
 *
 * // Usage:
 * const users = UserRepo(client.model(UserModel));
 * const user = await users.findByEmail("t1", "alice@example.com");
 * await users.create({ ... }); // base CRUD still available
 * ```
 */
export function defineRepository<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TPaths extends readonly [string, ...string[]],
  TDefaults extends DefaultsMap<TSchema>,
  TCustom extends Record<string, unknown>,
>(
  _model: ModelDefinition<TSchema, TPaths, TDefaults>,
  factory: (container: CosmioContainer<TSchema, TPaths, TDefaults>) => TCustom,
): (
  container: CosmioContainer<TSchema, TPaths, TDefaults>,
) => CosmioContainer<TSchema, TPaths, TDefaults> & TCustom {
  return (container) => {
    const custom = factory(container);
    return Object.assign(Object.create(Object.getPrototypeOf(container)), container, custom);
  };
}
