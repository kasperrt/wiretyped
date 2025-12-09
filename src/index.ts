/**
 * Root entrypoint for WireTyped: re-exports the core client, types, and error utilities.
 * Use this import if you want everything from a single module surface.
 * @module
 */

/**
 * Constructor options accepted by {@link RequestClient}.
 */
export type { RequestClientProps } from './core/client';
/**
 * Typed HTTP client for performing validated REST and SSE calls.
 */
export { RequestClient } from './core/client';
/**
 * Shape of endpoint definition maps consumed by {@link RequestClient}.
 */
export type { RequestDefinitions } from './core/types';
/**
 * Error thrown when a request is aborted via AbortController.
 */
/**
 * Type guard that checks if an error is an {@link AbortError}.
 */
export { AbortError, isAbortError } from './error/abortError';
/**
 * Error representing a error constructing URL.
 */
/**
 * Type guard for {@link ConstructURLError}.
 */
/**
 * Extract an {@link ConstructURLError} from an unknown error value, following nested causes.
 */
export { ConstructURLError, getConstructURLError, isConstructURLError } from './error/constructUrlError';
/**
 * Error representing a non-2xx HTTP response.
 */
/**
 * Extracts an {@link HTTPError} from an unknown error value.
 */
/**
 * Type guard that checks if an error is an {@link HTTPError}.
 */
export { getHttpError, HTTPError, isHttpError } from './error/httpError';
/**
 * Error representing a a retry attempts exhausted.
 */
/**
 * Type guard for {@link RetryExhaustedError}.
 */
/**
 * Extract an {@link RetryExhaustedError} from an unknown error value, following nested causes.
 */
export { getRetryExhaustedError, isRetryExhaustedError, RetryExhaustedError } from './error/retryExhaustedError.js';
/**
 * Error representing a a retry attempt suppressed and exited from retrying further.
 */
/**
 * Type guard for {@link RetrySuppresedError}.
 */
/**
 * Extract an {@link RetrySuppresedError} from an unknown error value, following nested causes.
 */
export { getRetrySuppressedError, isRetrySuppressedError, RetrySuppressedError } from './error/retrySuppressedError.js';
/**
 * Error thrown when a request exceeds the configured timeout.
 */
/**
 * Type guard that checks if an error is a {@link TimeoutError}.
 */
export { isTimeoutError, TimeoutError } from './error/timeoutError';
/**
 * Error thrown when validation of payloads fails.
 */
/**
 * Extracts a {@link ValidationError} from an unknown error value.
 */
/**
 * Type guard that checks if an error is a {@link ValidationError}.
 */
export { getValidationError, isValidationError, ValidationError } from './error/validationError';
