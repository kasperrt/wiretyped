import type { CacheClientOptions } from '../cache/client';
import type { FetchClientOptions } from '../fetch/client';
import type { SafeWrapAsync } from '../utils/wrap';

/** Header options accepted by the fetch wrapper. */
export type HeaderOptions = NonNullable<RequestInit['headers']> | Record<string, string | null>;

/** Subset of HTTP status codes used for retry logic. */
export type StatusCode =
  | 100
  | 101
  | 102
  | 103
  | 200
  | 201
  | 202
  | 203
  | 204
  | 205
  | 206
  | 207
  | 208
  | 214
  | 226
  | 300
  | 301
  | 302
  | 303
  | 304
  | 305
  | 307
  | 308
  | 400
  | 401
  | 402
  | 403
  | 404
  | 405
  | 406
  | 407
  | 408
  | 409
  | 410
  | 411
  | 412
  | 413
  | 414
  | 415
  | 416
  | 417
  | 418
  | 421
  | 422
  | 423
  | 424
  | 425
  | 426
  | 428
  | 429
  | 431
  | 451
  | 500
  | 501
  | 502
  | 503
  | 504
  | 505
  | 506
  | 507
  | 508
  | 510
  | 511;

/** Options to pass in for each fetch request */
export interface FetchOptions extends Omit<RequestInit, 'headers'> {
  /** Headers merged with provider defaults. */
  headers?: HeaderOptions;
  /** Abort signal to cancel the request. */
  signal?: AbortSignal;
}

/** Fetch response with a narrowed status code union. */
export interface FetchResponse extends Response {
  /** "Strong" type of status-codes {@link StatusCode} */
  status: StatusCode;
}

/** Options for retry logic and standard */
export type RetryOptions = {
  /**
   * The number of times to retry failed requests.
   * @default 2
   */
  limit?: number;
  /**
   * Time to wait before retrying
   */
  timeout?: number;
} & (
  | {
      /**
       * The HTTP status codes allowed to retry.
       * @default: [408, 429, 500, 501, 502, 503, 504]
       */
      statusCodes?: StatusCode[];
      ignoreStatusCodes?: never;
    }
  | {
      /**
       * The HTTP status codes skipping retries.
       */
      ignoreStatusCodes?: StatusCode[];
      statusCodes?: never;
    }
);

/** Request-level options that sit above the raw fetch options. */
export interface RequestOptions {
  /**
   * Whether request should be cached or not internally
   */
  cacheRequest?: boolean;
  /**
   * Cache TTL
   */
  cacheTimeToLive?: number;
  /**
   * Whether to validate or not, defaults to true due
   * to global client default to true
   */
  validate?: boolean;
  /**
   * Request timeout in milliseconds.
   * @default 60000
   */
  timeout?: number | false;
  /** Retry behavior (object for fine-grained control or number for attempt count). */
  retry?: RetryOptions | number;
}

/** Common request options including cache and validation controls. */
export type Options = Pick<FetchOptions, 'credentials' | 'headers' | 'mode' | 'signal'> & RequestOptions;

/**
 * Runtime configuration payload accepted by `RequestClient.config`.
 * - `fetchOpts`: default fetch/request options (headers, credentials, etc.).
 * - `cacheOpts`: cache defaults for GET requests.
 */
export interface Config {
  fetchOpts?: Omit<Options, 'signal' | 'cacheRequest' | 'cacheTimeToLive'>;
  cacheOpts?: CacheClientOptions;
}

/** Contract for HTTP client implementations used by RequestClient. */
export interface FetchClientProviderDefinition {
  /** Executes a GET request. */
  get: (url: string, options: Omit<FetchOptions, 'method' | 'body'>) => SafeWrapAsync<Error, FetchResponse>;
  /** Executes a PUT request. */
  put: (url: string, options: Omit<FetchOptions, 'method'>) => SafeWrapAsync<Error, FetchResponse>;
  /** Executes a PATCH request. */
  patch: (url: string, options: Omit<FetchOptions, 'method'>) => SafeWrapAsync<Error, FetchResponse>;
  /** Executes a POST request. */
  post: (url: string, options: Omit<FetchOptions, 'method'>) => SafeWrapAsync<Error, FetchResponse>;
  /** Executes a DELETE request. */
  delete: (url: string, options: Omit<FetchOptions, 'method' | 'body'>) => SafeWrapAsync<Error, FetchResponse>;
  /** Updates default options for the provider. */
  config: (opts: FetchClientOptions) => void;
  /** Optional lifecycle hook to dispose resources (e.g., keep-alive agents). */
  dispose?: () => void;
}

/** Factory signature for constructing HTTP providers. */
export interface FetchClientProvider {
  /** Creates a new instance of the fetch-client, with a base-url + options */
  new (baseUrl: string, opts: FetchClientOptions): FetchClientProviderDefinition;
}
