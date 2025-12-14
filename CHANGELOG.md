# Releases

## Contents
- [v0.3.2-alpha.0](#v032-alpha0)
- [v0.3.1](#v031)
- [v0.3.0](#v030)
- [v0.2.5](#v025)
- [v0.2.4](#v024)
- [v0.2.3](#v023)
- [v0.2.2](#v022)
- [v0.2.1](#v021)
- [v0.2.0](#v020)
- [v0.1.2](#v012)
- [v0.1.1](#v011)
- [v0.1.0](#v010)
- [v0.0.8](#v008)

## v0.3.2-alpha.0

- Remove excessive obscurification in cache-client key generation for better universality.
- Update tsconfig.build.json to better reflect and not inherit to reduce surface for leaking types.

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
