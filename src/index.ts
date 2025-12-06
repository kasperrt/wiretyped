/**
 * Root entrypoint for WireTyped: re-exports the core client, types, and error utilities.
 * Use this import if you want everything from a single module surface.
 * @module
 */

/** Constructor options accepted by {@link RequestClient}. */
/** Shape of endpoint definition maps consumed by {@link RequestClient}. */
export type { RequestClientProps, RequestDefinitions } from './core';
/** Typed HTTP client for performing validated REST and SSE calls. */
export { RequestClient } from './core';
/** Error thrown when a request is aborted via AbortController. */
/** Error representing a non-2xx HTTP response. */
/** Error thrown when a request exceeds the configured timeout. */
/** Error thrown when validation of payloads fails. */
/** Extracts an {@link HTTPError} from an unknown error value. */
/** Extracts a {@link ValidationError} from an unknown error value. */
/** Type guard that checks if an error is an {@link AbortError}. */
/** Type guard that checks if an error is an {@link HTTPError}. */
/** Type guard that checks if an error is a {@link TimeoutError}. */
/** Type guard that checks if an error is a {@link ValidationError}. */
export {
  AbortError,
  getHttpError,
  getValidationError,
  HTTPError,
  isAbortError,
  isHttpError,
  isTimeoutError,
  isValidationError,
  TimeoutError,
  ValidationError,
} from './error';
