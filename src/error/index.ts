/**
 * Error entrypoint: exports typed HTTP errors and helpers for identifying and unwrapping error types.
 * Use this when you only need error utilities without the core client.
 * @module
 */

/** Error thrown when a request is aborted. */
/** Type guard for {@link AbortError}. */
export { AbortError, isAbortError } from './abortError';
/** Error thrown for non-2xx HTTP responses. */
/** Extract an {@link HTTPError} from an unknown error. */
/** Type guard for {@link HTTPError}. */
export { getHttpError, HTTPError, isHttpError } from './httpError';
/** Generic type guard that matches an error constructor against an unknown error. */
export { isErrorType } from './isErrorType';
/** Error thrown when a request exceeds the configured timeout. */
/** Type guard for {@link TimeoutError}. */
export { isTimeoutError, TimeoutError } from './timeoutError';

/** Recursively unwraps nested causes to find a specific error class. */
export { unwrapErrorType } from './unwrapErrorType';
