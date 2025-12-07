/**
 * Error entrypoint: exports typed HTTP errors and helpers for identifying and unwrapping error types.
 * Use this when you only need error utilities without the core client.
 * @module
 */

/**
 * Error raised when a request is intentionally aborted (e.g., via AbortController).
 */
export { AbortError } from './abortError';

/**
 * Type guard for {@link AbortError}.
 */
export { isAbortError } from './abortError';

/**
 * Error representing an HTTP response with a non-2xx status code.
 */
export { HTTPError } from './httpError';

/**
 * Extract an {@link HTTPError} from an unknown error value, following nested causes.
 */
export { getHttpError } from './httpError';

/**
 * Type guard for {@link HTTPError}.
 */
export { isHttpError } from './httpError';

/**
 * Generic type guard to check if an unknown error matches a specific error class.
 */
export { isErrorType } from './isErrorType';

/**
 * Error raised when a request exceeds the configured timeout threshold.
 */
export { TimeoutError } from './timeoutError';

/**
 * Type guard for {@link TimeoutError}.
 */
export { isTimeoutError } from './timeoutError';

/**
 * Extract a specific error type from an unknown error value, following nested causes.
 */
export { unwrapErrorType } from './unwrapErrorType';

/**
 * Error representing a validation error when validating with @standard-schema
 */
export { ValidationError } from './validationError';

/**
 * Type guard for {@link ValidationError}.
 */
export { isValidationError } from './validationError';

/**
 * Extract an {@link ValidationError} from an unknown error value, following nested causes.
 */
export { getValidationError } from './validationError';
