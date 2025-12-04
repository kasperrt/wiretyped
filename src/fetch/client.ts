import { HTTPError } from '../error/httpError';
import type { FetchOptions, FetchResponse } from '../types/request';
import { type SafeWrapAsync, safeWrapAsync } from '../utils/wrap';
import { mergeHeaderOptions } from './utils';

/** Options to configure the {@link FetchClient} wrapper. */
export interface FetchClientOptions extends Pick<FetchOptions, 'headers'> {
  /**
   * Fetch credentials mode.
   * {@link RequestCredentials}
   */
  credentials?: RequestCredentials;
  /** Fetch mode.
   * {@link RequestMode}
   */
  mode?: RequestMode;
}

/**
 * Thin wrapper around the native `fetch` API that:
 * - prefixes all requests with a configured base URL,
 * - merges default and per-request options,
 * - returns error-first tuples via {@link SafeWrapAsync}.
 */
export class FetchClient {
  /** Base URL prepended to all request paths. */
  #baseUrl: string;
  /** Default fetch options (headers, credentials, mode). */
  #opts: FetchClientOptions;

  /** Creates a new instance of the fetch-client, with a base-url + options */
  constructor(baseUrl: string, opts?: FetchClientOptions) {
    if (!baseUrl.endsWith('/')) {
      baseUrl += '/';
    }

    this.#baseUrl = baseUrl;
    this.#opts = opts ?? {};
  }

  /**
   * Updates default fetch options (merged with existing headers).
   */
  public config(opts: FetchClientOptions) {
    this.#opts = {
      ...this.#opts,
      ...opts,
      headers: mergeHeaderOptions(this.#opts.headers, opts.headers),
    };
  }

  /**
   * Executes a GET request against the given endpoint.
   *
   * @param endpoint - Relative endpoint path (e.g. `users/123`).
   * @param opts - Request options merged with the client's defaults.
   * @returns A promise resolving to `[error, response]`.
   */
  public get(endpoint: string, opts: Omit<FetchOptions, 'method' | 'body'>): SafeWrapAsync<Error, FetchResponse> {
    return this.#request(endpoint, { ...opts, method: 'GET', body: undefined });
  }

  /**
   * Executes a PUT request against the given endpoint.
   *
   * @param endpoint - Relative endpoint path (e.g. `users/123`).
   * @param body - Request body as a serialized string (usually JSON).
   * @param opts - Request options merged with the client's defaults.
   * @returns A promise resolving to `[error, response]`.
   */
  public put(endpoint: string, opts: Omit<FetchOptions, 'method'>): SafeWrapAsync<Error, FetchResponse> {
    return this.#request(endpoint, { ...opts, method: 'PUT' });
  }

  /**
   * Executes a PATCH request against the given endpoint.
   *
   * @param endpoint - Relative endpoint path (e.g. `users/123`).
   * @param body - Request body as a serialized string (usually JSON).
   * @param opts - Request options merged with the client's defaults.
   * @returns A promise resolving to `[error, response]`.
   */
  public patch(endpoint: string, opts: Omit<FetchOptions, 'method'>): SafeWrapAsync<Error, FetchResponse> {
    return this.#request(endpoint, { ...opts, method: 'PATCH' });
  }

  /**
   * Executes a POST request against the given endpoint.
   *
   * @param endpoint - Relative endpoint path (e.g. `users`).
   * @param body - Request body as a serialized string (usually JSON).
   * @param opts - Request options merged with the client's defaults.
   * @returns A promise resolving to `[error, response]`.
   */
  public post(endpoint: string, opts: Omit<FetchOptions, 'method'>): SafeWrapAsync<Error, FetchResponse> {
    return this.#request(endpoint, { ...opts, method: 'POST' });
  }

  /**
   * Executes a DELETE request against the given endpoint.
   *
   * @param endpoint - Relative endpoint path (e.g. `users/123`).
   * @param opts - Request options merged with the client's defaults.
   * @returns A promise resolving to `[error, response]`.
   */
  public delete(endpoint: string, opts: Omit<FetchOptions, 'method' | 'body'>): SafeWrapAsync<Error, FetchResponse> {
    return this.#request(endpoint, {
      ...opts,
      method: 'DELETE',
      body: undefined,
    });
  }

  /**
   * Core request implementation used by all HTTP verb helpers.
   *
   * Responsibilities:
   * - Merge default and per-call headers.
   * - Delegates to the native `fetch` API.
   *
   * Errors:
   * - Network / fetch errors are wrapped in `Error`.
   * - Non-2xx responses are wrapped in `HTTPError`.
   *
   * @param endpoint - Relative endpoint path.
   * @param opts - Fully-resolved request options.
   * @returns A promise resolving to `[error, response]`.
   */
  async #request(endpoint: string, opts: FetchOptions): SafeWrapAsync<Error, FetchResponse> {
    const headers = mergeHeaderOptions(this.#opts.headers, opts.headers);

    const [err, res] = await safeWrapAsync(() =>
      fetch(this.constructPath(endpoint), {
        body: opts.body,
        method: opts.method,
        mode: opts.mode ?? this.#opts.mode,
        credentials: opts.credentials ?? this.#opts.credentials,
        headers,
        ...(opts.signal && { signal: opts.signal }),
      }),
    );

    if (err) {
      return [new Error(`error wrapping ${opts.method} request in fetchClient`, { cause: err }), null];
    }

    if (!res.ok) {
      return [new HTTPError(res, `error in ${opts.method} request in fetchClient`), null];
    }

    // Cast this for some more type-safety on http-status-codes
    return [null, res as FetchResponse];
  }

  /**
   * Joins the base URL and endpoint into a single URL string.
   *
   * - Strips a leading slash from the endpoint to avoid `//` in the URL.
   *
   * @param endpoint - Endpoint to append to the base URL.
   * @returns The combined URL.
   */
  private constructPath(endpoint: string): string {
    return `${this.#baseUrl}${endpoint.replace(/^\//, '')}`;
  }
}
