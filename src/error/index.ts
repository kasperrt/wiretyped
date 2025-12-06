/**
 * Error entrypoint: exports typed HTTP errors and helpers for identifying and unwrapping error types.
 * Use this when you only need error utilities without the core client.
 * @module
 */

/** Error thrown when a request is aborted via AbortController. */
/** Type guard that checks if an error is an {@link AbortError}. */
export { AbortError, isAbortError } from './abortError';
/** Error representing a non-2xx HTTP response. */
/** Extracts an {@link HTTPError} from an unknown error value. */
/** Type guard that checks if an error is an {@link HTTPError}. */
export { getHttpError, HTTPError, isHttpError } from './httpError';
/** Generic type guard that matches an error constructor against an unknown error. */
export { isErrorType } from './isErrorType';
/** Error thrown when a request exceeds the configured timeout. */
/** Type guard that checks if an error is a {@link TimeoutError}. */
export { isTimeoutError, TimeoutError } from './timeoutError';
/** Recursively unwraps nested causes to find a specific error class. */
export { unwrapErrorType } from './unwrapErrorType';
/** Error thrown when validation of payloads fails. */
/** Type guard that checks if an error is a {@link ValidationError}. */
/** Extracts a {@link ValidationError} from an unknown error value. */
export { getValidationError, isValidationError, ValidationError } from './validationError';
