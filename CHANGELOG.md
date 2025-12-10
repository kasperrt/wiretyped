# WireTyped Releases

## Contents
- [v0.2.5-rc-3](#v025-rc-3)
- [v0.2.4](#v024)
- [v0.2.3](#v023)
- [v0.2.2](#v022)
- [v0.2.1](#v021)
- [v0.2.0](#v020)
- [v0.1.2](#v012)
- [v0.1.1](#v011)
- [v0.1.0](#v010)
- [v0.0.8](#v008)

## v0.2.5-rc-3

- Add RetryExhaustError for better traceability of retry stops/exhaust.
- Add RetrySuppressedError for better traceability of retry stops/suppresses.
- Add ConstructURLError to allow easier way to spot if it was URL constructing error instead of message parsing.
- Update description, keywords, and README.md intro for more targetted info and description on package.
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
