<div align="center">

# Wiretype HTTP Client

<img src="./public/wiretyped.png" alt="Wiretyped logo" width="200" />

Typed HTTP client utilities for defining endpoints with zod, issuing requests, and handling errors in an error-first style.

</div>

## Why this package?

- **Typed endpoints first**: Define once with zod, get full TypeScript safety for params, bodies, and responses.
- **Error-first ergonomics**: Returns `[error, data]` tuples (a Go-like pattern) to avoid hidden throws and make control flow explicit.
- **Runtime validation**: Optional request/response validation to catch mismatches early, not in production logs.
- **Pragmatic helpers**: Built-in caching, retries, and SSE support with minimal configuration.
- **Runtime errors**: I hate them, and wanted to get rid of them.
- **Badges**: Plus, look at these cool badges.
  
[![CI](https://github.com/kasperrt/wiretyped/actions/workflows/ci.yml/badge.svg)](https://github.com/kasperrt/wiretyped/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/kasperrt/wiretyped/branch/main/graph/badge.svg)](https://codecov.io/gh/kasperrt/wiretyped)


## Contents
- [Wiretype HTTP Client](#wiretype-http-client)
  - [Why this package?](#why-this-package)
  - [Contents](#contents)
  - [Installation](#installation)
  - [Quick start](#quick-start)
  - [Imports](#imports)
  - [Methods](#methods)
    - [GET](#get)
    - [POST](#post)
    - [PUT](#put)
    - [PATCH](#patch)
    - [DELETE](#delete)
    - [DOWNLOAD](#download)
    - [URL](#url)
    - [SSE](#sse)
  - [Caching](#caching)
  - [Retries](#retries)
  - [Error handling](#error-handling)
  - [Exposed entrypoints](#exposed-entrypoints)
  - [Building](#building)
  - [Publishing](#publishing)
  - [Scripts](#scripts)
  - [Tests](#tests)

## Installation

```sh
pnpm add wiretype
# or: npm install wiretype
# or: npx jsr add @kasperrt/wiretyped
```

## Quick start

Define your endpoints with zod (re-exported for convenience) and create a `RequestClient`.

Notes on path params:
- Use `$path` when you want constrained values (e.g., enums for `/integrations/{provider}` and want said providers to be from a given set like `slack`, `salesforce`, etc.).
- For dynamic segments that accept generic strings/numbers, you can omit `$path`—the URL template (e.g., `/users/{id}`) already infers string/number.

```ts
import { RequestClient, type RequestDefinitions, z } from 'wiretype/core';

const endpoints = {
  '/users/{id}': {
    get: {
      response: z.object({ id: z.string(), name: z.string() }),
    },
  },
} satisfies RequestDefinitions;

const client = new RequestClient({
  baseUrl: 'https://api.example.com',
  hostname: 'api.example.com',
  endpoints,
  validation: true,
});

const [err, user] = await client.get('/users/{id}', { id: '123' });
if (err) {
  return err; // preferably re-wrap, and don't throw, you'll go to jail
};
console.log(user.name);
```

Prefer a single import? The root export works too:

```ts
import { RequestClient, type RequestDefinitions, z } from 'wiretype';
```

## Imports

- Root: `import { RequestClient, z, ...errors } from 'wiretype'`
- Subpath: `import { RequestClient, z } from 'wiretype/core'`
- Errors-only: `import { HTTPError, unwrapErrorType, ... } from 'wiretype/error'`

## Methods

Each method is a thin, typed wrapper over your endpoint definitions. The shape stays consistent: `(endpointKey, params, [body], options)`, and every call returns an error-first tuple `[error, data]` so you can handle outcomes without hidden throws.

### GET

Request definition:
```ts
const endpoints = {
  '/users': { get: { $search: z.object({ limit: z.number().optional() }).optional(), response: z.array(z.object({ id: z.string() })) } },
  '/integrations/{provider}': {
    get: {
      $path: z.object({ provider: z.enum(['slack', 'github']) }),
      response: z.object({ provider: z.enum(['slack', 'github']), status: z.string() }),
    },
  },
} satisfies RequestDefinitions;
```

Fetch data with optional query/path validation and opt-in caching.
```ts
const [err, users] = await client.get('/users', { $search: { limit: 10 } });
const [integrationErr, integration] = await client.get('/integrations/{provider}', { $path: { provider: 'slack' } });
```

### POST

Request definition:
```ts
const endpoints = {
  '/users': {
    post: { request: z.object({ name: z.string(), email: z.string().email() }), response: z.object({ id: z.string(), name: z.string(), email: z.string() }) },
  },
} satisfies RequestDefinitions;
```

Create resources with validated request/response bodies.
```ts
const [err, created] = await client.post('/users', null, { name: 'Ada', email: 'ada@example.com' });
```

### PUT

Request definition:
```ts
const endpoints = {
  '/users/{id}': {
    put: {
      request: z.object({ name: z.string(), email: z.string().email() }),
      response: z.object({ id: z.string(), name: z.string(), email: z.string() }),
    },
  },
} satisfies RequestDefinitions;
```

Replace resources, validating both path and payload.
```ts
const [err, updated] = await client.put('/users/{id}', { id: '123' }, { name: 'Ada', email: 'ada@ex.com' });
```

### PATCH

Request definition:
```ts
const endpoints = {
  '/users/{id}': {
    patch: {
      request: z.object({ name: z.string().optional() }),
      response: z.object({ id: z.string(), name: z.string() }),
    },
  },
} satisfies RequestDefinitions;
```

Partially update resources.
```ts
const [err, patched] = await client.patch('/users/{id}', { id: '123' }, { name: 'Ada Lovelace' });
```

### DELETE

Request definition:
```ts
const endpoints = {
  '/users/{id}': {
    delete: { response: z.object({ deleted: z.boolean() }) },
  },
} satisfies RequestDefinitions;
```

Delete resources; still typed responses if your API returns a body.
```ts
const [err, deletion] = await client.delete('/users/{id}', { id: '123' });
```

### DOWNLOAD

Request definition:
```ts
const endpoints = {
  '/files/{id}/download': {
    download: { response: z.instanceof(Blob) },
  },
} satisfies RequestDefinitions;
```

Retrieve binary data (e.g., Blob/stream).
```ts
const [err, file] = await client.download('/files/{id}/download', { id: 'file-1' });
```

### URL

Request definition:
```ts
const endpoints = {
  '/links': { url: { response: z.string().url() } },
} satisfies RequestDefinitions;
```

Return a constructed URL string without performing a request.
```ts
const [err, link] = await client.url('/links', null);
```

### SSE

Request definition:
```ts
const endpoints = {
  '/events': { sse: { response: z.string() } },
} satisfies RequestDefinitions;
```

Subscribe to server-sent events; signature is `(endpoint, params, handler, options)`. Returns a stop function for the stream.
```ts
const stop = await client.sse(
  '/events',
  null,
  ([err, data]) => {
    if (err) return console.error('sse error', err);
    console.log('sse message', data);
  },
  { withCredentials: true },
);
stop?.();
```

## Caching

GET requests can use an in-memory cache.

- Per-call: `client.get('/users', params, { cacheRequest: true, cacheTimeToLive: 60_000 })`
- Global defaults: `new RequestClient({ ..., cacheOpts: { cacheRequest: true, cacheTimeToLive: 60_000 } })`

Cache keys are derived from the constructed URL. When `cacheRequest` is enabled, cached data is returned until the TTL expires.

## Retries

Configure retries via `retry` on request options (or globally in the client constructor). Default retriable codes: 408, 429, 500–504.

- Number only: `retry: 3` (just a limit)
- Custom object:

```ts
client.get('/users', params, {
  retry: {
    limit: 5,                // total attempts (including the first)
    statusCodes: [429, 500], // retry only these statuses
    abortStatusCodes: [404], // never retry on these
    timeout: 500,            // wait 500ms between tries
  },
});
```

Example with a timeout focus:

```ts
client.post('/users', {}, body, {
  timeout: 10_000,
  retry: { limit: 2, statusCodes: [408], timeout: 1000 },
});
```

## Error handling

`wiretype/error` exports helpers for richer error handling:

```ts
import { HTTPError, getHttpError, isHttpError, isTimeoutError, unwrapErrorType } from 'wiretype/error';

const [err, user] = await client.get('/users/{id}', { $path: { id: '123' } });
if (err) {
  const httpError = getHttpError(err);
  if (httpError(unwrapped)) {
    console.error('error request failed with status', httpError.status);
  } else if (isTimeoutError(unwrapped)) {
    console.error('error request timed out');
  }
}
```

## Exposed entrypoints

- Root import (client, types, z, errors): `wiretype`
- Core client and types (includes `z` re-export): `wiretype/core`
- Error helpers: `wiretype/error`

## Building

Library builds are handled by Vite:

```sh
pnpm build
```

Outputs land in `dist/` as both ESM (`*.mjs`) and CJS (`*.cjs`) bundles, with declarations under `dist/types`.

## Publishing

The package is wired for publishing to npm:

```sh
pnpm test          # optional but recommended
pnpm build
pnpm publish --access public
```

Suggested workflow:

1. Bump the version: `npm version patch|minor|major`
2. Build artifacts: `pnpm build`
3. Publish: `pnpm publish --access public`

## Scripts

- `pnpm build` – generate bundles (Vite) and type declarations.
- `pnpm test` – run the Vitest suite.
- `pnpm check` – type-check without emitting output.
- `pnpm format:fix` / `pnpm lint:fix` / `pnpm fix` – Biome formatting and linting helpers.

## Tests

- Use Vitest with co-located files: prefer `*.test.ts` beside the code under test (e.g., `fetch/client.ts` and `fetch/client.test.ts` in the same folder).
- Keep tests focused and readable: arrange inputs, act, then assert. Prefer the error-first tuple ergonomics to mirror real usage.
- Stub external effects (fetch, timers, SSE) with lightweight fakes rather than hitting the network.
- Favor small, focused cases over large integration-style suites.
