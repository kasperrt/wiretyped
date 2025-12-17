/**
 * Error entrypoint: exports typed HTTP errors and helpers for identifying and unwrapping error types.
 * Use this when you only need error utilities without the core client.
 * @module
 */

/** Error thrown when a request is aborted via AbortController. */
/** Type guard that checks if an error is an {@link AbortError}. */
export { AbortError, isAbortError } from './abortError.js';
/** Error representing a error constructing URL. */
/** Extract an {@link ConstructURLError} from an unknown error value, following nested causes. */
/** Type guard for {@link ConstructURLError}. */
export { ConstructURLError, getConstructURLError, isConstructURLError } from './constructUrlError.js';
/** Extracts an {@link HTTPError} from an unknown error value. */
/** Error representing a non-2xx HTTP response. */
/** Type guard that checks if an error is an {@link HTTPError}. */
export { getHttpError, HTTPError, isHttpError } from './httpError.js';
/** Generic type guard that matches an error constructor against an unknown error. */
export { isErrorType } from './isErrorType.js';
/** Extract an {@link RetryExhaustedError} from an unknown error value, following nested causes. */
/** Type guard for {@link RetryExhaustedError}. */
/** Error representing a retry attempts exhausted. */
export { getRetryExhaustedError, isRetryExhaustedError, RetryExhaustedError } from './retryExhaustedError.js';
/** Extract an {@link RetrySuppressedError} from an unknown error value, following nested causes. */
/** Type guard for {@link RetrySuppressedError}. */
/** Error representing a retry attempt suppressed and exited from retrying further. */
export { getRetrySuppressedError, isRetrySuppressedError, RetrySuppressedError } from './retrySuppressedError.js';
/** Type guard that checks if an error is a {@link TimeoutError}. */
/** Error thrown when a request exceeds the configured timeout. */
export { isTimeoutError, TimeoutError } from './timeoutError.js';
/** Recursively unwraps nested causes to find a specific error class. */
export { unwrapErrorType } from './unwrapErrorType.js';
/** Extracts a {@link ValidationError} from an unknown error value. */
/** Type guard that checks if an error is a {@link ValidationError}. */
/** Error thrown when validation of payloads fails. */
export { getValidationError, isValidationError, ValidationError } from './validationError.js';
