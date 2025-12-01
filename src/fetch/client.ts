import { AbortError, isAbortError } from '../error/abortError';
import { getHttpError, HTTPError } from '../error/httpError';
import { isTimeoutError, TimeoutError } from '../error/timeoutError';
import { retry } from '../utils/retry';
import { type SafeWrapAsync, safeWrapAsync } from '../utils/wrap';
import type { FetchOptions, FetchResponse, StatusCode } from './types';
import { mergeHeaderOptions } from './utils';

export interface FetchClientOptions extends Pick<FetchOptions, 'timeout' | 'headers' | 'retry'> {
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
 * - adds retry behavior for transient errors,
 * - adds timeout handling using `AbortController`,
 * - returns error-first tuples via {@link SafeWrapAsync}.
 */
export class FetchClient {
  #baseUrl: string;
  #opts: FetchClientOptions;
  #defaultRetryCodes: StatusCode[] = [408, 429, 500, 501, 502, 503, 504];
  #defaultTimeout = 60_000;

  constructor(baseUrl: string, opts?: FetchClientOptions) {
    if (!baseUrl.endsWith('/')) {
      baseUrl += '/';
    }

    this.#baseUrl = baseUrl;
    this.#opts = opts ?? {};

    if (this.#opts.timeout === undefined) {
      this.#opts.timeout = this.#defaultTimeout;
    }
  }

  /**
   * Executes a GET request against the given endpoint.
   *
   * @param endpoint - Relative endpoint path (e.g. `users/123`).
   * @param opts - Request options merged with the client's defaults.
   * @returns A promise resolving to `[error, response]`.
   */
  public get(endpoint: string, opts?: Omit<FetchOptions, 'method' | 'body'>) {
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
  public put(endpoint: string, body: string, opts?: Omit<FetchOptions, 'method' | 'body'>) {
    return this.#request(endpoint, { ...opts, method: 'PUT', body });
  }

  /**
   * Executes a PATCH request against the given endpoint.
   *
   * @param endpoint - Relative endpoint path (e.g. `users/123`).
   * @param body - Request body as a serialized string (usually JSON).
   * @param opts - Request options merged with the client's defaults.
   * @returns A promise resolving to `[error, response]`.
   */
  public patch(endpoint: string, body: string, opts?: Omit<FetchOptions, 'method' | 'body'>) {
    return this.#request(endpoint, { ...opts, method: 'PATCH', body });
  }

  /**
   * Executes a POST request against the given endpoint.
   *
   * @param endpoint - Relative endpoint path (e.g. `users`).
   * @param body - Request body as a serialized string (usually JSON).
   * @param opts - Request options merged with the client's defaults.
   * @returns A promise resolving to `[error, response]`.
   */
  public post(endpoint: string, body: string, opts?: Omit<FetchOptions, 'method' | 'body'>) {
    return this.#request(endpoint, { ...opts, method: 'POST', body });
  }

  /**
   * Executes a DELETE request against the given endpoint.
   *
   * @param endpoint - Relative endpoint path (e.g. `users/123`).
   * @param opts - Request options merged with the client's defaults.
   * @returns A promise resolving to `[error, response]`.
   */
  public delete(endpoint: string, opts?: Omit<FetchOptions, 'method' | 'body'>) {
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
   * - Configure retry behavior (attempt count, timeout between attempts,
   *   and which HTTP status codes are considered retryable).
   * - Configure timeout behavior via an `AbortController`.
   * - Wrap the underlying `fetch` call in {@link tupleRetry} so that
   *   transient errors can be retried.
   *
   * Errors:
   * - Network / fetch errors are wrapped in `Error` or `TimeoutError`.
   * - Non-2xx responses are wrapped in `HTTPError`.
   *
   * @param endpoint - Relative endpoint path.
   * @param opts - Fully-resolved request options.
   * @returns A promise resolving to `[error, response]`.
   */
  #request(endpoint: string, opts: FetchOptions): SafeWrapAsync<Error, FetchResponse> {
    const headers = mergeHeaderOptions(this.#opts.headers, opts.headers);

    const retryOptions = opts.retry ?? this.#opts.retry ?? { limit: 2 };
    const simpleRetry = typeof retryOptions === 'number';
    const retryTimeout = simpleRetry ? 1000 : retryOptions.timeout;
    const attempts = simpleRetry ? retryOptions : retryOptions.limit;
    const ignoreStatusCodes: StatusCode[] = simpleRetry ? [] : (retryOptions.ignoreStatusCodes ?? []);
    const retryCodes = simpleRetry ? this.#defaultRetryCodes : (retryOptions.statusCodes ?? this.#defaultRetryCodes);

    const timeout = opts.timeout ?? this.#opts.timeout;

    return retry<FetchResponse>({
      name: 'requestRetrier',
      attempts,
      timeout: retryTimeout,
      log: false,
      // errFn decides whether we really should retry or not,
      // where if it returns true, we have an error that we
      // don't want to retru. false = keep retrying
      errFn: (err) => {
        // If we get an abort-error that means our normal
        // abort-signal was thrown
        const abortError = isAbortError(err);
        if (abortError) {
          return true;
        }

        // Timeout errors we want to retry
        const timeoutError = isTimeoutError(err);
        if (timeoutError) {
          return false;
        }

        // Non-http-errors that's not caught, we want to retry
        const httpError = getHttpError(err);
        if (!httpError) {
          return false;
        }

        // Don't retry if we've excluded this
        if (ignoreStatusCodes.includes(httpError.response.status)) {
          return true;
        }

        // Retry-codes that we have defined we want to retry
        if (retryCodes.includes(httpError.response.status) || ignoreStatusCodes.length > 0) {
          return false;
        }

        return true;
      },
      fn: async () => {
        const timeoutSignal = this.createTimeoutSignal(timeout);
        const signal = this.mergeSignals([opts.signal, timeoutSignal]);

        const [err, res] = await safeWrapAsync(() =>
          fetch(this.constructPath(endpoint), {
            body: opts.body,
            method: opts.method,
            mode: opts.mode ?? this.#opts.mode,
            credentials: opts.credentials ?? this.#opts.credentials,
            headers,
            ...(signal && { signal }),
          }),
        );

        if (err) {
          return [new Error(`error running ${opts.method} request`, { cause: err }), null];
        }

        if (!res.ok) {
          return [new HTTPError(res, `error in ${opts.method} request`), null];
        }

        // Cast this for some more type-safety on http-status-codes
        return [null, res as FetchResponse];
      },
    });
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

  /**
   * Creates an {@link AbortSignal} that will automatically abort after
   * the specified timeout.
   *
   * When `timeoutMs` is `false` or `0`, no timeout signal is created.
   *
   * @param timeoutMs - Timeout in milliseconds, or `false` to disable.
   * @returns An `AbortSignal` that aborts after the timeout, or `null`.
   */
  private createTimeoutSignal(timeoutMs?: number | false): AbortSignal | null {
    if (!timeoutMs) {
      return null;
    }

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(new TimeoutError(`error request timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );

    controller.signal.addEventListener('abort', () => clearTimeout(timeout), {
      once: true,
    });

    return controller.signal;
  }

  /**
   * Merges multiple {@link AbortSignal} instances into a single signal.
   *
   * Behavior:
   * - If no signals are provided, returns `null`.
   * - If a single signal is provided, it is returned as-is.
   * - If multiple signals are provided, a new `AbortController` is created
   *   and will abort when any of the source signals abort.
   * - Attempts to preserve the abort `reason` when available, otherwise
   *   aborts with an {@link AbortError}.
   *
   * @param signals - List of signals to merge (nullable/undefined allowed).
   * @returns A single `AbortSignal` or `null` if all inputs are nullish.
   */
  private mergeSignals(signals: Array<AbortSignal | null | undefined>): AbortSignal | null {
    const active: AbortSignal[] = signals.filter((s): s is AbortSignal => s !== null && s !== undefined);

    if (active.length === 0) {
      return null;
    }

    if (active.length === 1) {
      return active[0];
    }

    const controller = new AbortController();
    const listeners: VoidFunction[] = [];
    const abortFrom = (source: AbortSignal) => {
      if ('reason' in source) {
        controller.abort(source.reason);
        return;
      }

      controller.abort(new AbortError('error signal triggered with unknown reason'));
    };

    controller.signal.addEventListener('abort', () => {
      for (const remove of listeners) {
        remove();
      }
    });

    for (const signal of active) {
      if (signal.aborted) {
        abortFrom(signal);
        break;
      }

      const abort = () => abortFrom(signal);
      signal.addEventListener('abort', abort, { once: true });
      listeners.push(() => signal.removeEventListener('abort', abort));
    }

    return controller.signal;
  }
}
