/**
 * Lifecycle hook events for CosmioContainer.
 */
export type HookEvent =
  | "beforeCreate"
  | "afterCreate"
  | "beforeUpsert"
  | "afterUpsert"
  | "beforeReplace"
  | "afterReplace"
  | "beforeDelete"
  | "afterDelete"
  | "afterRead";

export type HookFn = (doc: Record<string, unknown>) => void | Promise<void>;

/**
 * Hook registry for a container. Supports multiple hooks per event.
 */
export class HookRegistry {
  private readonly _hooks = new Map<HookEvent, HookFn[]>();

  /**
   * Register a hook for the given event.
   */
  on(event: HookEvent, fn: HookFn): this {
    const list = this._hooks.get(event) ?? [];
    list.push(fn);
    this._hooks.set(event, list);
    return this;
  }

  /**
   * Run all hooks for the given event, in registration order.
   */
  async run(event: HookEvent, doc: Record<string, unknown>): Promise<void> {
    const list = this._hooks.get(event);
    if (!list) return;
    for (const fn of list) {
      await fn(doc);
    }
  }

  /**
   * Check if any hooks are registered for the given event.
   */
  has(event: HookEvent): boolean {
    const list = this._hooks.get(event);
    return !!list && list.length > 0;
  }

  /**
   * Create a copy of this registry (for scope() etc.).
   */
  clone(): HookRegistry {
    const copy = new HookRegistry();
    for (const [event, fns] of this._hooks) {
      copy._hooks.set(event, [...fns]);
    }
    return copy;
  }
}
