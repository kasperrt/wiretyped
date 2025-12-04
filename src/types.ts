import type { FetchClientOptions } from './fetch/client';
import type { SafeWrapAsync } from './utils/wrap';

/** Header options accepted by the fetch wrapper. */
export type HeaderOptions = NonNullable<RequestInit['headers']> | Record<string, string | undefined>;

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

export interface FetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: HeaderOptions;
  /** Abort signal to cancel the request. */
  signal?: AbortSignal;
}

/** Fetch response with a narrowed status code union. */
export interface FetchResponse extends Response {
  status: StatusCode;
}

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

/** Contract for HTTP client implementations used by RequestClient. */
export interface FetchClientProviderDefinition {
  get: (url: string, options: Omit<FetchOptions, 'method' | 'body'>) => SafeWrapAsync<Error, FetchResponse>;
  put: (url: string, options: Omit<FetchOptions, 'method'>) => SafeWrapAsync<Error, FetchResponse>;
  patch: (url: string, options: Omit<FetchOptions, 'method'>) => SafeWrapAsync<Error, FetchResponse>;
  post: (url: string, options: Omit<FetchOptions, 'method'>) => SafeWrapAsync<Error, FetchResponse>;
  delete: (url: string, options: Omit<FetchOptions, 'method' | 'body'>) => SafeWrapAsync<Error, FetchResponse>;
}

/** Factory signature for constructing HTTP providers. */
export interface FetchClientProvider {
  new (baseUrl: string, opts: FetchClientOptions): FetchClientProviderDefinition;
}

/**
 * Listener mapping for SSEClient
 */
interface SSEClientSourceEventMap {
  error: Event;
  message: MessageEvent;
  open: Event;
}

/** Init options for SSEClient */
export interface SSEClientSourceInit {
  withCredentials?: boolean;
}

/** Minimal EventSource-like contract expected by the SSE client. */
export interface SSEClientProviderDefinition {
  readonly url: string;
  readonly withCredentials: boolean;
  readonly readyState: number;
  readonly CLOSED: 2;
  readonly CONNECTING: 0;
  readonly OPEN: 1;

  onopen: ((this: SSEClientProviderDefinition, ev: Event) => void) | null;
  onmessage: ((this: SSEClientProviderDefinition, ev: MessageEvent) => void) | null;
  onerror: ((this: SSEClientProviderDefinition, ev: Event) => void) | null;

  close(): void;
  addEventListener<K extends keyof SSEClientSourceEventMap>(
    type: K,
    listener: (this: SSEClientProviderDefinition, ev: SSEClientSourceEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof SSEClientSourceEventMap>(
    type: K,
    listener: (this: SSEClientProviderDefinition, ev: SSEClientSourceEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  dispatchEvent(event: Event): boolean;
}

/** Factory signature for constructing SSE providers. */
export interface SSEClientProvider {
  new (url: string | URL, eventSourceInitDict?: SSEClientSourceInit): SSEClientProviderDefinition;
}
