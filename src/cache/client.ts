import type { Interval } from '../types/timeout.js';
import { type SafeWrapAsync, safeWrap, safeWrapAsync } from '../utils/wrap.js';

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
  #cache: Record<string, CacheItem> = {};
  #pending: Record<string, SafeWrapAsync<Error, unknown>> = {};

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
      this.#cache = {};
      this.#pending = {};
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
    this.#cache = {};
    this.#pending = {};
  }

  /**
   * Add item to cache by provided key
   * @param {string} key - cache key
   * @param {Object} data - cache data
   */
  #add<T = unknown>(key: string, data: T, ttl: number) {
    const expires = Date.now() + ttl;
    this.#cache[key] = {
      key,
      data,
      expires,
    };
  }

  /**
   * Get item from cache by provided key if exists
   * @param {string} key - Cache key
   */
  #getItem<T>(key: string) {
    const item = this.#cache[key];
    if (!item) {
      return null;
    }
    const remaining = item.expires - Date.now();
    if (remaining > 0) {
      return item as T;
    }

    delete this.#cache[key];
    delete this.#pending[key];
    return null;
  }

  /**
   * Add request to the pending list. This will be reused by other requests using the same key/endpoint.
   * After the request is complete, it will resolve the pending request by calling the resolvePendingRequest.
   * @param {string} key - cache key
   * @param {Promise} request - http request to put in the pending object
   */
  #addPendingRequest = <T = unknown>(key: string, request: () => SafeWrapAsync<Error, T>, ttl: number) => {
    this.#pending[key] = (async (): SafeWrapAsync<Error, T> => {
      const [errWrapped, wrapped] = await safeWrapAsync(() => request());
      if (errWrapped) {
        delete this.#pending[key];
        return [new Error('error thrown on cache wrapping request', { cause: errWrapped }), null];
      }

      const [errData, data] = wrapped;
      if (errData) {
        delete this.#pending[key];
        return [new Error('error getting cached request', { cause: errData }), null];
      }

      this.#add(key, data, ttl);
      return [null, data];
    })();
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

    if (this.#pending[key] !== undefined) {
      return this.#pending[key] as SafeWrapAsync<Error, T>;
    }

    this.#addPendingRequest(key, res, ttl);
    return this.#pending[key];
  };

  /**
   * Constructs a deterministic cache key that incorporates the URL and merged headers.
   * The key is sha256 or base64-encoded using built-in primitives.
   */
  public async key(url: string, headers: Headers): Promise<string> {
    const header = Array.from(headers.entries())
      .sort()
      .map(([key, value]) => `${key}:${value}`)
      .join('|');

    const input = `${url}|${header}`;
    const data = new TextEncoder().encode(input);

    let [errHasher, hasher] = safeWrap(() => globalThis.crypto);
    if (errHasher) {
      // Safeguard, in reality should never be hit
      /* v8 ignore next -- @preserve */
      [errHasher, hasher] = safeWrap(() => crypto);
    }

    if (typeof hasher !== 'undefined' && hasher && 'subtle' in hasher) {
      const hashBuffer = await hasher.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      return hashHex;
    }

    let [errEncoder, encoder] = safeWrap(() => globalThis.btoa);
    if (errEncoder) {
      // Safeguard, in reality should never be hit
      /* v8 ignore next -- @preserve */
      [errEncoder, encoder] = safeWrap(() => btoa);
    }

    if (typeof encoder === 'function') {
      return encoder(Array.from(data, (v) => String.fromCharCode(v)).join(''));
    }

    let [errBuffer, buffer] = safeWrap(() => globalThis.Buffer);
    if (errBuffer) {
      // Safeguard, in reality should never be hit
      /* v8 ignore next -- @preserve */
      [errBuffer, buffer] = safeWrap(() => Buffer);
    }

    if (!!buffer && typeof buffer !== 'undefined' && 'from' in buffer) {
      return buffer.from(input, 'utf-8').toString('base64');
    }

    return input;
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
