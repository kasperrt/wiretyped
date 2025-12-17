/**
 * Root entrypoint for WireTyped: re-exports the core client, types, and error utilities.
 * Use this import if you want everything from a single module surface.
 * @module
 */

/**
 * Constructor options accepted by {@link RequestClient}.
 */
export type { RequestClientProps } from './core/client.js';

/**
 * Typed HTTP client for performing validated REST and SSE calls.
 */
export { RequestClient } from './core/client.js';

/**
 * Shape of endpoint definition maps consumed by {@link RequestClient}.
 */
export type { RequestDefinitions } from './core/types.js';

/** Type guard that checks if an error is an {@link AbortError}. */
export { isAbortError } from './error/abortError.js';
/** Extract an {@link ConstructURLError} from an unknown error value, following nested causes. */
/** Type guard for {@link ConstructURLError}. */
export { getConstructURLError, isConstructURLError } from './error/constructUrlError.js';
/** Extracts an {@link HTTPError} from an unknown error value. */
/** Type guard that checks if an error is an {@link HTTPError}. */
export { getHttpError, HTTPError, isHttpError } from './error/httpError.js';
/** Extract an {@link RetryExhaustedError} from an unknown error value, following nested causes. */
/** Type guard for {@link RetryExhaustedError}. */
export { getRetryExhaustedError, isRetryExhaustedError } from './error/retryExhaustedError.js';
/** Extract an {@link RetrySuppressedError} from an unknown error value, following nested causes. */
/** Type guard for {@link RetrySuppressedError}. */
export { getRetrySuppressedError, isRetrySuppressedError } from './error/retrySuppressedError.js';
/** Type guard that checks if an error is a {@link TimeoutError}. */
export { isTimeoutError } from './error/timeoutError.js';
/** Extracts a {@link ValidationError} from an unknown error value. */
/** Type guard that checks if an error is a {@link ValidationError}. */
export { getValidationError, isValidationError } from './error/validationError.js';
