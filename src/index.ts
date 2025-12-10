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

/**
 * Error thrown when a request is aborted via AbortController.
 */
/**
 * Type guard that checks if an error is an {@link AbortError}.
 */
export { AbortError, isAbortError } from './error/abortError.js';

/**
 * Error representing a error constructing URL.
 */
/**
 * Extract an {@link ConstructURLError} from an unknown error value, following nested causes.
 */
/**
 * Type guard for {@link ConstructURLError}.
 */
export { ConstructURLError, getConstructURLError, isConstructURLError } from './error/constructUrlError.js';

/**
 * Extracts an {@link HTTPError} from an unknown error value.
 */
/**
 * Error representing a non-2xx HTTP response.
 */
/**
 * Type guard that checks if an error is an {@link HTTPError}.
 */
export { getHttpError, HTTPError, isHttpError } from './error/httpError.js';

/**
 * Extract an {@link RetryExhaustedError} from an unknown error value, following nested causes.
 */
/**
 * Type guard for {@link RetryExhaustedError}.
 */
/**
 * Error representing a retry attempts exhausted.
 */
export { getRetryExhaustedError, isRetryExhaustedError, RetryExhaustedError } from './error/retryExhaustedError.js';

/**
 * Extract an {@link RetrySuppressedError} from an unknown error value, following nested causes.
 */
/**
 * Type guard for {@link RetrySuppressedError}.
 */
/**
 * Error representing a retry attempt suppressed and exited from retrying further.
 */
export { getRetrySuppressedError, isRetrySuppressedError, RetrySuppressedError } from './error/retrySuppressedError.js';

/**
 * Type guard for {@link TimeoutError}.
 */
/**
 * Error thrown when a request exceeds the configured timeout.
 */
export { isTimeoutError, TimeoutError } from './error/timeoutError.js';

/**
 * Error thrown when validation of payloads fails.
 */
/**
 * Type guard that checks if an error is a {@link ValidationError}.
 */
/**
 * Extracts a {@link ValidationError} from an unknown error value.
 */
export { getValidationError, isValidationError, ValidationError } from './error/validationError.js';
