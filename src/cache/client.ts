import type { Interval } from '../types/timeout.js';
import { type SafeWrapAsync, safeWrapAsync } from '../utils/wrap.js';

/** Options for cache-client */
export interface CacheClientOptions {
  /**
   * Cache time to live.
   * @default 500
   */
  ttl?: number;
  /**
   * Cache cleanup interval.
   * @default 30_000
   */
  cleanupInterval?: number;
}

interface CacheItem<T = unknown> {
  key: string;
  data: T;
  expires: number;
}

/**
 * Cache layer for HttpClient
 * @param {Object} opts - Cache options
 * @property {number} opts.ttl - Time to live for requests in milliseconds
 * @property {number} opts.cleanupInterval - Cleanup interval in ms
 */
export class CacheClient {
  #ttl: number;
  #cleanupInterval: number;
  #intervalId: Interval;
  #cache: Map<string, CacheItem> = new Map();
  #pending: Map<string, SafeWrapAsync<Error, unknown>> = new Map();

  /**
   * Creates a cache client with in-memory TTL-based storage.
   *
   * @param opts - Cache configuration; defaults to `ttl: 500` and `cleanupInterval: 30_000`.
   */
  constructor(opts?: CacheClientOptions) {
    this.#ttl = opts?.ttl ?? 500;
    this.#cleanupInterval = opts?.cleanupInterval ?? 30_000;

    this.#cleanup();
  }

  /**
   * Updates cache configuration without recreating the client.
   */
  public config(opts: Partial<CacheClientOptions>) {
    if (opts.ttl !== undefined && opts.ttl !== this.#ttl) {
      this.#ttl = opts.ttl;
      this.#cache = new Map();
      this.#pending = new Map();
    }

    if (opts.cleanupInterval !== undefined) {
      this.#cleanupInterval = opts.cleanupInterval;
    }

    this.#cleanup();
  }

  /**
   * Disposes the cache client by clearing timers and cached entries.
   * Useful for short-lived clients to avoid leaking intervals.
   */
  public dispose() {
    clearInterval(this.#intervalId);
    this.#intervalId = undefined;
    this.#cache = new Map();
    this.#pending = new Map();
  }

  /**
   * Add item to cache by provided key
   * @param {string} key - cache key
   * @param {Object} data - cache data
   */
  #add<T = unknown>(key: string, data: T, ttl: number) {
    const expires = Date.now() + ttl;
    this.#cache.set(key, { key, data, expires });
  }

  /**
   * Get item from cache by provided key if exists
   * @param {string} key - Cache key
   */
  #getItem<T>(key: string) {
    const item = this.#cache.get(key);
    if (!item) {
      return null;
    }
    const remaining = item.expires - Date.now();
    if (remaining > 0) {
      return item as T;
    }

    this.#cache.delete(key);
    this.#pending.delete(key);
    return null;
  }

  /**
   * Add request to the pending list. This will be reused by other requests using the same key/endpoint.
   * After the request is complete, it will resolve the pending request by calling the resolvePendingRequest.
   * @param {string} key - cache key
   * @param {Promise} request - http request to put in the pending object
   */
  #addPendingRequest = <T = unknown>(key: string, request: () => SafeWrapAsync<Error, T>, ttl: number) => {
    const pending = (async (): SafeWrapAsync<Error, T> => {
      const [errWrapped, wrapped] = await safeWrapAsync(() => request());
      if (errWrapped) {
        this.#pending.delete(key);
        return [new Error('error thrown on cache wrapping request', { cause: errWrapped }), null];
      }

      const [errData, data] = wrapped;
      if (errData) {
        this.#pending.delete(key);
        return [new Error('error getting cached request', { cause: errData }), null];
      }

      this.#add(key, data, ttl);
      return [null, data];
    })();

    this.#pending.set(key, pending);
  };

  /**
   * Pass a request to the cache
   * @param {string} key - cache key
   * @param {Function} res - http request and data returned.
   */
  public get = <T = unknown>(
    key: string,
    res: () => SafeWrapAsync<Error, T>,
    ttl = this.#ttl,
  ): SafeWrapAsync<Error, T> => {
    const cachedData = this.#getItem<CacheItem<T>>(key);
    if (cachedData) {
      return Promise.resolve([null, cachedData.data]);
    }

    const pending = this.#pending.get(key);
    if (pending !== undefined) {
      return pending as SafeWrapAsync<Error, T>;
    }

    this.#addPendingRequest(key, res, ttl);
    return this.#pending.get(key);
  };

  /**
   * Constructs a deterministic, unambiguous cache key based on URL + headers.
   *
   * - Unambiguous: uses JSON.stringify over a structured tuple.
   * - Deterministic: lowercases header names and sorts (name, then value).
   *
   * NOTE: This intentionally does *not* hash/encode the key (since this cache is in-memory).
   */
  public key(url: string, headers: Headers): string {
    const normalizedHeaders = [...headers]
      .map(([k, v]) => [k.toLowerCase(), v] as const)
      .sort(([ak, av], [bk, bv]) => {
        if (ak === bk) {
          return av < bv ? -1 : av > bv ? 1 : 0;
        }

        return ak < bk ? -1 : 1;
      });

    return JSON.stringify([url, normalizedHeaders]);
  }

  /**
   * cleanup that does housekeeping every 30 seconds, removing
   * invalid cache items to prevent unecessary memory usage;
   */
  #cleanup = () => {
    clearInterval(this.#intervalId);

    this.#intervalId = setInterval(() => {
      for (const key of Object.keys(this.#cache)) {
        this.#getItem(key);
      }
    }, this.#cleanupInterval);
  };
}
