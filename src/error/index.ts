/**
 * Error entrypoint: exports typed HTTP errors and helpers for identifying and unwrapping error types.
 * Use this when you only need error utilities without the core client.
 * @module
 */

/** Error thrown when a request is aborted via AbortController. */
export { AbortError } from './abortError.js';
/** Error representing a error constructing URL. */
export { ConstructURLError } from './constructUrlError.js';
/** Error representing a non-2xx HTTP response. */
export { HTTPError } from './httpError.js';
/** Generic type guard that matches an error constructor against an unknown error. */
export { isErrorType } from './isErrorType.js';
/** Error representing a retry attempts exhausted. */
export { RetryExhaustedError } from './retryExhaustedError.js';
/** Error representing a retry attempt suppressed and exited from retrying further. */
export { RetrySuppressedError } from './retrySuppressedError.js';
/** Error thrown when a request exceeds the configured timeout. */
export { TimeoutError } from './timeoutError.js';
/** Recursively unwraps nested causes to find a specific error class. */
export { unwrapErrorType } from './unwrapErrorType.js';
/** Error thrown when validation of payloads fails. */
export { ValidationError } from './validationError.js';
