/**
 * Root entrypoint for WireTyped: re-exports the core client, types, and error utilities.
 * Use this import if you want everything from a single module surface.
 * @module
 */
export { RequestClient, type RequestClientProps, type RequestDefinitions, type RequestOptions } from './core';
export {
  AbortError,
  getHttpError,
  HTTPError,
  isAbortError,
  isHttpError,
  isTimeoutError,
  TimeoutError,
} from './error';
