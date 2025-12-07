/**
 * Error entrypoint: exports typed HTTP errors and helpers for identifying and unwrapping error types.
 * Use this when you only need error utilities without the core client.
 * @module
 */

/**
 * Error raised when a request is intentionally aborted (e.g., via AbortController).
 */
/**
 * Type guard for {@link AbortError}.
 */
export { AbortError, isAbortError } from './abortError';
/**
 * Error representing an HTTP response with a non-2xx status code.
 */
/**
 * Extract an {@link HTTPError} from an unknown error value, following nested causes.
 */
/**
 * Type guard for {@link HTTPError}.
 */
export { getHttpError, HTTPError, isHttpError } from './httpError';

/**
 * Generic type guard to check if an unknown error matches a specific error class.
 */
export { isErrorType } from './isErrorType';
/**
 * Error raised when a request exceeds the configured timeout threshold.
 */
/**
 * Type guard for {@link TimeoutError}.
 */
export { isTimeoutError, TimeoutError } from './timeoutError';

/**
 * Extract a specific error type from an unknown error value, following nested causes.
 */
export { unwrapErrorType } from './unwrapErrorType';
/**
 * Error representing a validation error when validating with @standard-schema
 */
/**
 * Type guard for {@link ValidationError}.
 */
/**
 * Extract an {@link ValidationError} from an unknown error value, following nested causes.
 */
export { getValidationError, isValidationError, ValidationError } from './validationError';
