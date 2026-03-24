interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * Simple in-memory TTL cache for point reads.
 * Reduces RU consumption for frequently-read documents.
 */
export class ReadCache {
  private readonly _store = new Map<string, CacheEntry>();
  private readonly _defaultTtlMs: number;
  private readonly _maxSize: number;

  constructor(options?: {
    /**
     * Default cache TTL in milliseconds.
     * Default: Infinity (no expiration — cache lives until scope is GC'd).
     * For request-scoped usage (scope() / withCosmioContext), Infinity is correct
     * because the cache is discarded when the request ends.
     */
    ttlMs?: number;
    /** Maximum number of cached entries (default: 1000) */
    maxSize?: number;
  }) {
    this._defaultTtlMs = options?.ttlMs ?? Number.POSITIVE_INFINITY;
    this._maxSize = options?.maxSize ?? 1000;
  }

  /**
   * Get a value from cache. Returns undefined if not found or expired.
   */
  get<T>(key: string): T | undefined {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    return structuredClone(entry.value) as T;
  }

  /**
   * Set a value in cache with optional custom TTL.
   */
  set(key: string, value: unknown, ttlMs?: number): void {
    // Evict oldest if at capacity
    if (this._store.size >= this._maxSize && !this._store.has(key)) {
      const firstKey = this._store.keys().next().value;
      if (firstKey !== undefined) {
        this._store.delete(firstKey);
      }
    }
    this._store.set(key, {
      value: structuredClone(value),
      expiresAt: Date.now() + (ttlMs ?? this._defaultTtlMs),
    });
  }

  /**
   * Invalidate a specific key.
   */
  invalidate(key: string): void {
    this._store.delete(key);
  }

  /**
   * Invalidate all keys matching a prefix.
   * Used to clear query caches for a container after writes.
   */
  invalidateByPrefix(prefix: string): void {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key);
      }
    }
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this._store.clear();
  }

  /**
   * Build a cache key from container name, id, and partition key values.
   */
  static buildKey(container: string, id: string, pk: readonly unknown[]): string {
    return `${container}\0${id}\0${JSON.stringify(pk)}`;
  }

  get size(): number {
    return this._store.size;
  }
}
