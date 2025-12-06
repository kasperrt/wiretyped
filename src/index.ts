/**
 * Root entrypoint for WireTyped: re-exports the core client, types, and error utilities.
 * Use this import if you want everything from a single module surface.
 * @module
 */

/** Constructor options for {@link RequestClient}. */
/** Shape of endpoint definitions consumed by {@link RequestClient}. */
export type { RequestClientProps, RequestDefinitions } from './core';
/** Typed HTTP client for performing validated REST and SSE calls. */
export { RequestClient } from './core';
/** Error thrown when a request is aborted via `AbortController`. */
/** Error thrown when a non-2xx HTTP response is returned. */
/** Error thrown when a request exceeds its timeout. */
/** Helper to unwrap an {@link HTTPError} from an unknown error. */
/** Type guard that checks if an error is {@link AbortError}. */
/** Type guard that checks if an error is {@link HTTPError}. */
/** Type guard that checks if an error is {@link TimeoutError}. */
export { AbortError, getHttpError, HTTPError, isAbortError, isHttpError, isTimeoutError, TimeoutError } from './error';
