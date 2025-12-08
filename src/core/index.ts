/**
 * Core entrypoint: exports the typed request client, and request definitions.
 * Import from here if you only need the client/types without error helpers.
 * @module
 */

/**
 * Constructor options accepted by {@link RequestClient}.
 */
export type { RequestClientProps } from './client.js';

/**
 * Typed HTTP client that:
 * - constructs URLs based on endpoint definitions,
 * - performs HTTP (and SSE) requests via a pluggable provider,
 * - optionally validates request/response payloads via schemas,
 * - optionally caches GET responses.
 *
 * All methods return error-first tuples via {@link SafeWrapAsync} or {@link SafeWrap}.
 *
 * @typeParam Schema - The map of endpoint definitions available to the client.
 */
export { RequestClient } from './client.js';

/**
 * RequestDefinitions types up the possible variations of
 * the endpoints we create
 */
export type { RequestDefinitions } from './types.js';
