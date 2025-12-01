/**
 * Error entrypoint: exports typed HTTP errors and helpers for identifying and unwrapping error types.
 * Use this when you only need error utilities without the core client.
 */
export { AbortError, isAbortError } from './abortError';
export { getHttpError, HTTPError, isHttpError } from './httpError';
export { isErrorType } from './isErrorType';
export { isTimeoutError, TimeoutError } from './timeoutError';
export { unwrapErrorType } from './unwrapErrorType';
