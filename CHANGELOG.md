# Releases

## Contents
- [v0.4.0-alpha.0](#v0-4-0-alpha-0)
- [v0.3.4-alpha.0](#v0-3-4-alpha-0)
- [v0.3.3](#v0-3-3)
- [v0.3.2](#v0-3-2)
- [v0.3.1](#v0-3-1)
- [v0.3.0](#v0-3-0)
- [v0.2.5](#v0-2-5)
- [v0.2.4](#v0-2-4)
- [v0.2.3](#v0-2-3)
- [v0.2.2](#v0-2-2)
- [v0.2.1](#v0-2-1)
- [v0.2.0](#v0-2-0)
- [v0.1.2](#v0-1-2)
- [v0.1.1](#v0-1-1)
- [v0.1.0](#v0-1-0)
- [v0.0.8](#v0-0-8)

## v0.4.0-alpha.0

- Remove getters and checkers for error abstraction, and only expose isErrorType and unwrapErrorType.

## v0.3.4-alpha.0

- Internal; Handle 205 status-codes more gracefully by defaulting to null returned as body.
- Internal; Reduce overhead for getResponseData to read response once through `.text()` with attempting parsing on `application/json` or `+json` in the `Content-Type` header.


## v0.3.3

- Bump @standard-schema/spec@1.1.0.
- Make response optional for both `url` and `download`, but at the same time enforce `string` for `url`, and `Blob` for download if defined.
- Add validation before `url` and `download` return.
- Add more and better examples to guide for download + url.
- Internal; Improve default destructuring in RequestClient.
- Internal; More direct cache-pending return.
- Internal; Cleanup pending cache faster.
- Internal; More iteratively merging headers for nicer readability and sanitization.
- Internal; Add AbortSignal.any execution attempt.
- Internal; Reduce excessive checks and variables in validator function.
- Internal; Remove hono, simple-git-hooks, (direct) vue dependencies.
- Internal; 'Native' e2e-tests for node, bun, deno, cloudflare workers, browser.

## v0.3.2

- Remove excessive obscurification in cache-client key generation for better universality.
- Update tsconfig.build.json to better reflect and not inherit to reduce surface for leaking types.
- Adds support for booleans in URL.
- Adds better coverage for cache-key generation.
- Remove debug option.
- Remove logger.
- Remove internal retrier-name.
- Improve SSE parsing (buffering + block splitting).
- Support CRLF (\r\n\r\n) block delimiters.
- Buffer across chunk boundaries so events/data lines split across reads are handled.
- Treat empty data: as an empty payload.
- Flush the final unterminated block when the stream closes.
- Include more tests to validate that input/output for SSE is correct.
- Add tryParse function to try to parse JSON, if not return whatever input was from before.

## v0.3.1

- Fix excessive resulting URL leading `/` removal in constructURL (and fix faulty test).
- Update internal SSE handler-callback-types to be strictly defined on call, with a looser variant in consumation with kept semi strict type-inference with key-check.
- Remove internal excessive type-casts in CacheClient.
- Improve readability of internal retrier.
- Add missing JSDoc to internal sleeper.
- Add VitePress docs site and split README into a guide/reference structure under `docs/`.
- Improve cache-key generation safeguarding against runtime errors.

## v0.3.0

- Switch SSE to use fetch streaming instead of EventSource; schemas now define an `events` map of typed event payloads, e.g.:
  
```ts
const endpoints = {
  '/events': {
    sse: {
      events: {
        message: z.object({ msg: z.string() }),
        status: z.string(),
      },
    },
  },
} satisfies RequestDefinitions;
```

and usages with such as:
```ts
const [err, close] = await client.sse(
  '/events',
  null,
  ([err, event]) => {
    if (err) return console.error('sse error', err);
    if (event.type === 'message') {
      console.log('message', event.data.msg);
    }
    if (event.type === 'status') {
      console.log('status', event.data); // data is string
    }
  },
  { credentials: 'include' },
);
```

- SSE handler remains error-first; unknown event types can be ignored or surfaced via `errorUnknownType`.
- Added README docs and e2e coverage for multi-event SSE streams and validation behavior.
- Allow SSE events to parse string-only data.
- Add global AbortController for full client disposing, stopping any requests or open SSE requests in flight.
- Update keywords to target package more correctly.

## v0.2.5

- Add RetryExhaustedError for better traceability of retry stops/exhaust.
- Add RetrySuppressedError for better traceability of retry stops/suppresses.
- Add ConstructURLError to allow easier way to spot if it was URL constructing error instead of message parsing.
- Update description, keywords, and README.md intro for more targeted info and description on package.
- Internal: Reduce bundlesize by combining internals of RequestClients to one method enabling a higher degree of reuse.
- Internal: Various dev package updates

## v0.2.4

- Simplify and correct build outputs.

## v0.2.3

- Update to vite@8
- Fix type imports/requires referenced in package.json for esm/cjs to correctly target file-types.
- Repository referencing in package.json.

## v0.2.2

- Fix Deno exports so the root entrypoint resolves correctly.

## v0.2.1

- Fix missing validation in `constructUrl` when no params are provided.


## v0.2.0

- Move retrying from fetch-client into request-client for broader coverage.


## v0.1.2

- Fix query parameters being double-encoded as search params.


## v0.1.1

- Make `EventSource` optional to reduce bundle size when browsers already provide it.


## v0.1.0

- Rewrite zod -> @standard-schema/spec to allow users to decide their own schema and keep things as lightweight as possible.
- Make constructUrl async to handle standard-schema/spec potential validation asynchronouseness.
- Make url async due to the above.

Patch non-minor updates:
- Update to add some more potential (outlier) runtime errors catch.
- Smokescreen type-test.
- Actually export types to finished build so the package isn't untyped.

## v0.0.8

- Smokescreen tests + readme updates.