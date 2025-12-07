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
 * Shape of endpoint definition maps consumed by {@link RequestClient}.
 */
export type { RequestDefinitions } from './core/types';

/**
 * Typed HTTP client for performing validated REST and SSE calls.
 */
export { RequestClient } from './core/client';

/**
 * Error thrown when a request is aborted via AbortController.
 */
export { AbortError } from './error/abortError';

/**
 * Error representing a non-2xx HTTP response.
 */
export { HTTPError } from './error/httpError';

/**
 * Error thrown when a request exceeds the configured timeout.
 */
export { TimeoutError } from './error/timeoutError';

/**
 * Error thrown when validation of payloads fails.
 */
export { ValidationError } from './error/validationError';

/**
 * Extracts an {@link HTTPError} from an unknown error value.
 */
export { getHttpError } from './error/httpError';

/**
 * Extracts a {@link ValidationError} from an unknown error value.
 */
export { getValidationError } from './error/validationError';

/**
 * Type guard that checks if an error is an {@link AbortError}.
 */
export { isAbortError } from './error/abortError';

/**
 * Type guard that checks if an error is an {@link HTTPError}.
 */
export { isHttpError } from './error/httpError';

/**
 * Type guard that checks if an error is a {@link TimeoutError}.
 */
export { isTimeoutError } from './error/timeoutError';

/**
 * Type guard that checks if an error is a {@link ValidationError}.
 */
export { isValidationError } from './error/validationError';
