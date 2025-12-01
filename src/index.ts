/**
 * Root entrypoint for wiretyped: re-exports the core client, types, z, and error utilities.
 * Use this import if you want everything from a single module surface.
 */
export * as z from 'zod';
export { RequestClient, type RequestClientProps, type RequestDefinitions } from './core';
export {
  AbortError,
  getHttpError,
  HTTPError,
  isAbortError,
  isHttpError,
  isTimeoutError,
  TimeoutError,
} from './error';
