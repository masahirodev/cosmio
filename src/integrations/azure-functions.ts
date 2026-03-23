import { AsyncLocalStorage } from "node:async_hooks";
import { ReadCache } from "../client/cache.js";

/**
 * Per-invocation context stored via AsyncLocalStorage.
 * Automatically scoped to each Azure Functions invocation.
 */
export interface CosmioInvocationContext {
  invocationId: string;
  cache: ReadCache;
}

const storage = new AsyncLocalStorage<CosmioInvocationContext>();

/**
 * Get the current invocation context (if running inside cosmioHook).
 */
export function getCosmioContext(): CosmioInvocationContext | undefined {
  return storage.getStore();
}

/**
 * Get the per-invocation ReadCache (if running inside cosmioHook).
 * Used internally by CosmioContainer for automatic request-scoped caching.
 */
export function getInvocationCache(): ReadCache | undefined {
  return storage.getStore()?.cache;
}

/**
 * Azure Functions v4 pre/post invocation hooks.
 * Registers AsyncLocalStorage-based context so that all Cosmio operations
 * within an invocation automatically share a request-scoped cache.
 *
 * @example
 * ```ts
 * // src/functions/index.ts
 * import { app } from "@azure/functions";
 * import { cosmioHooks } from "cosmio/azure-functions";
 *
 * // Register once — all functions get per-invocation caching
 * cosmioHooks(app);
 * ```
 *
 * @example
 * ```ts
 * // src/functions/getUser.ts
 * import { app } from "@azure/functions";
 *
 * app.http("getUser", {
 *   handler: async (req, context) => {
 *     // No scope() needed — cache is automatic per invocation
 *     const user = await users.findById("u1", ["t1"]); // DB hit
 *     const same = await users.findById("u1", ["t1"]); // cached (0 RU)
 *     return { jsonBody: user };
 *   },
 * });
 * ```
 */
export function cosmioHooks(app: AzureFunctionsApp): void {
  app.hook.preInvocation((preContext) => {
    const ctx: CosmioInvocationContext = {
      invocationId: preContext.invocationContext.invocationId,
      cache: new ReadCache(),
    };

    // Run the function handler within AsyncLocalStorage context
    const originalHandler = preContext.functionHandler;
    preContext.functionHandler = (...args: unknown[]) => {
      return storage.run(ctx, () => (originalHandler as (...a: unknown[]) => unknown)(...args));
    };
  });
}

/**
 * Run a function within a Cosmio invocation context.
 * Use this outside Azure Functions (e.g., Express, Hono, standalone scripts).
 *
 * @example
 * ```ts
 * import { withCosmioContext } from "cosmio";
 *
 * // Express middleware
 * app.use((req, res, next) => {
 *   withCosmioContext(() => next());
 * });
 *
 * // Standalone
 * await withCosmioContext(async () => {
 *   const user = await users.findById("u1", ["t1"]); // cached within this scope
 * });
 * ```
 */
export function withCosmioContext<T>(fn: () => T, invocationId?: string): T {
  const ctx: CosmioInvocationContext = {
    invocationId: invocationId ?? crypto.randomUUID(),
    cache: new ReadCache(),
  };
  return storage.run(ctx, fn);
}

/**
 * Wrap an Azure Functions **v3** handler with per-invocation Cosmio context.
 * v3 has no hook system, so each handler must be wrapped individually.
 *
 * @example
 * ```ts
 * // Azure Functions v3
 * import { cosmioV3 } from "cosmio";
 *
 * module.exports = cosmioV3(async function (context, req) {
 *   // Cache is automatic within this invocation
 *   const user = await users.findById("u1", ["t1"]);
 *   const same = await users.findById("u1", ["t1"]); // cached
 *   context.res = { body: user };
 * });
 * ```
 */
export function cosmioV3<TArgs extends unknown[], TReturn>(
  handler: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  return (...args: TArgs) => {
    // Extract invocationId from v3 context (first arg)
    const v3Context = args[0] as { invocationId?: string } | undefined;
    const invocationId = v3Context?.invocationId ?? crypto.randomUUID();
    return withCosmioContext(() => handler(...args), invocationId);
  };
}

/**
 * Minimal type for Azure Functions v4 app object.
 * Avoids requiring @azure/functions as a dependency.
 */
interface AzureFunctionsApp {
  hook: {
    preInvocation: (handler: (context: PreInvocationContext) => void) => void;
  };
}

interface PreInvocationContext {
  invocationContext: { invocationId: string };
  functionHandler: unknown;
}
