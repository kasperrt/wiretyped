/**
 * Core entrypoint: exports the typed request client, and request definitions.
 * Import from here if you only need the client/types without error helpers.
 * @module
 */

/** Constructor options accepted by {@link RequestClient}. */
export type { RequestClientProps } from './client';
/** Typed HTTP client for constructing validated REST/SSE calls. */
export { RequestClient } from './client';
/** Endpoint definition map consumed by {@link RequestClient}. */
export type { RequestDefinitions } from './types';
