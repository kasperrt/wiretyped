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
export { AbortError } from './error/abortError.js';

/**
 * Error representing a error constructing URL.
 */
export { ConstructURLError } from './error/constructUrlError.js';

/**
 * Error representing a non-2xx HTTP response.
 */
export { HTTPError } from './error/httpError.js';

/**
 * Type guard for {@link RetryExhaustedError}.
 */
/**
 * Error representing a retry attempts exhausted.
 */
export { RetryExhaustedError } from './error/retryExhaustedError.js';

/**
 * Error representing a retry attempt suppressed and exited from retrying further.
 */
export { RetrySuppressedError } from './error/retrySuppressedError.js';

/**
 * Error thrown when a request exceeds the configured timeout.
 */
export { TimeoutError } from './error/timeoutError.js';

/**
 * Extracts a {@link ValidationError} from an unknown error value.
 */
export { ValidationError } from './error/validationError.js';
