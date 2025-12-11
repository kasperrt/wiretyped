<div align="center">

# WireTyped

<img src="./public/wiretyped.png" alt="Wiretyped logo" width="400" />

</div>

A universal fetch-based, typed HTTP client with error-first ergonomics, retries, caching, SSE, and Standard Schema validation.

Runs across browser, Node, Bun, and worker runtimes with a small, composable API and predictable failure modes.


## Why

- **Typed endpoints first**: Define once with the schema of your choice, get full TypeScript safety for params, bodies, and responses.
- **Error-first ergonomics**: Returns `[error, data]` tuples (a Go-like pattern) to avoid hidden throws and make control flow explicit.
- **Runtime validation**: Optional request/response validation to catch mismatches early, not in production logs.
- **Pragmatic helpers**: Built-in caching, retries, and SSE support with minimal configuration.
- **Runtime errors**: I hate them, and wanted to get rid of them.
- **Badges**: Plus, look at these cool badges.
  
[![CI](https://github.com/kasperrt/wiretyped/actions/workflows/ci.yml/badge.svg)](https://github.com/kasperrt/wiretyped/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/kasperrt/wiretyped/branch/main/graph/badge.svg)](https://codecov.io/gh/kasperrt/wiretyped)
[![minzip](https://badgen.net/bundlephobia/minzip/wiretyped)](https://bundlephobia.com/package/wiretyped@latest)

[![npm](https://img.shields.io/npm/v/wiretyped.svg)](https://www.npmjs.com/package/wiretyped)
[![JSR](https://jsr.io/badges/@kasperrt/wiretyped)](https://jsr.io/@kasperrt/wiretyped)



## Contents
- [WireTyped](#wiretyped)
  - [Why](#why)
  - [Contents](#contents)
  - [Installation](#installation)
  - [Quick start](#quick-start)
  - [Imports](#imports)
  - [Client options](#client-options)
  - [Request options](#request-options)
  - [Runtime config (optional)](#runtime-config-optional)
  - [Disposal](#disposal)
  - [Methods](#methods)
    - [GET](#get)
    - [POST](#post)
    - [PUT](#put)
    - [PATCH](#patch)
    - [DELETE](#delete)
    - [DOWNLOAD](#download)
    - [URL](#url)
    - [SSE](#sse)
      - [Options](#options)
  - [Caching](#caching)
  - [Retries](#retries)
  - [Error handling](#error-handling)
    - [Error types](#error-types)
  - [Exposed entrypoints](#exposed-entrypoints)
  - [Providers](#providers)
    - [HTTP provider shape](#http-provider-shape)
  - [Building](#building)
  - [Tests](#tests)
  - [Publishing](#publishing)
  - [Scripts](#scripts)
  - [FAQ](#faq)

## Installation

```sh
pnpm add wiretyped
# or: npm install wiretyped
# or: npx jsr add @kasperrt/wiretyped
```

## Quick start

Define your endpoints with the schema of your choice (re-exported for convenience) and create a `RequestClient`.

Notes on path params:
- Use `$path` when you want constrained values (e.g., enums for `/integrations/{provider}` and want said providers to be from a given set like `slack`, `salesforce`, etc.).
- For dynamic segments that accept generic strings/numbers, you can omit `$path`—the URL template (e.g., `/users/{id}`) already infers string/number.

```ts
import { RequestClient, type RequestDefinitions } from 'wiretyped/core';
import { z } from 'zod';

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
import { RequestClient, type RequestDefinitions } from 'wiretyped';
```

## Imports

- Root: `import { RequestClient,  ...errors } from 'wiretyped'`
- Subpath: `import { RequestClient } from 'wiretyped/core'`
- Errors-only: `import { HTTPError, unwrapErrorType, ... } from 'wiretyped/error'`

## Client options

- `baseUrl` (required): Base path prepended to all endpoints (e.g., `https://api.example.com/`).
- `hostname` (required): Absolute hostname used when building URLs (e.g., `https://api.example.com`); keeps `url()` outputs absolute.
- `endpoints` (required): Your typed endpoint definitions (`RequestDefinitions`).
- `validation` (default `true`): Validate request/response bodies using your schema definitions; can be overridden per call.
- `debug` (default `false`): Log internal client debug info.
- `cacheOpts`: Configure the cache store for GET requests (used when `cacheRequest` is enabled per-call). 

  ```ts
  {
    ttl?: number;              // Default cache TTL in ms (default 500)
    cleanupInterval?: number;  // How often to evict expired entries (default 30_000)
  }
  ```

- `fetchOpts`: Default fetch options for all calls (headers, credentials, timeout, retry).

  ```ts
  {
    headers?: Record<string, string>;  // Merged with defaults; adds { Accept: 'application/json' } by default
    credentials?: RequestCredentials;  // Passed to fetch
    mode?: RequestMode;                // Passed to fetch
    timeout?: number | false;          // Request timeout in ms (default 60_000). false disables
    retry?: number | {                 // Per-call retry (default limit 2, timeout 1000ms, retry on 408/429/500-504 and always on timeout or other errors)
      limit?: number;                  // How many times to retry (total attempts = limit + 1)
      timeout?: number;                // Ms between retries
      statusCodes?: number[];          // Status codes to retry
      ignoreStatusCodes?: number[];    // Status codes to never retry
    };
  }
  ```

## Request options

Per-call `options` mirror the fetch-level options (`FetchOptions`) with extra cache/validation flags for GET.

```ts
{
  headers?: Record<string, string>;  // Merged with defaults; adds { Accept: 'application/json' } by default
  credentials?: RequestCredentials;  // Passed to fetch
  mode?: RequestMode;                // Passed to fetch
  timeout?: number | false;          // Request timeout in ms (default 60_000). false disables
  retry?: number | {                 // Per-call retry (default limit 2, timeout 1000ms, retry on 408/429/500-504 and always on timeout or other errors)
    limit?: number;                  // How many times to retry (total attempts = limit + 1)
    timeout?: number;                // Ms between retries
    statusCodes?: number[];          // Status codes to retry
    ignoreStatusCodes?: number[];    // Status codes to never retry
  };
  validate?: boolean;                // Override global validation

  // Only available for GET requests
  cacheRequest?: boolean;            // GET only: enable in-memory cache
  cacheTimeToLive?: number;          // GET only: cache TTL in ms (default 500)
}
```

## Runtime config (optional)

`RequestClient` exposes a `config()` helper to update defaults at runtime—useful for rotated auth headers, new retry/timeout settings, or cache tuning. It is entirely optional; if you never call it, the client sticks with the constructor options.

```ts
// Later in your app lifecycle
client.config({
  fetchOpts: {
    headers: { Authorization: `Bearer ${token}` },    // merged with existing + default Accept
    credentials: 'include',                           // fetch-level only
    retry: { limit: 1 },                              // max retries; total attempts = limit + 1
    timeout: 10_000,                                  // request timeout in ms
  },
  cacheOpts: { ttl: 5_000, cleanupInterval: 30_000 }, // cache defaults when cacheRequest is enabled
});
```

The method forwards fetch-related updates to the underlying fetch provider and cache-related updates to the cache client without recreating them, so connections and caches stay intact while defaults change.

## Disposal

`RequestClient` runs a small cleanup interval for the in-memory cache. For short-lived clients (scripts, tests), call `client.dispose()` to clear timers and drop cached entries. If your custom fetch provider exposes `dispose`, it will be called too (useful for cleaning up agents, sockets, etc.).

```ts
const client = new RequestClient({ /* ... */ });
// ...use the client...
client.dispose(); // clears cache timers/state and invokes provider dispose if present
```

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
  '/events': {
    sse: {
      events: {
        message: z.object({ msg: z.string() }),
        status: z.object({ ok: z.boolean() }),
      },
    },
  },
} satisfies RequestDefinitions;
```

Subscribe to server-sent events; signature is `(endpoint, params, handler, options)`. Returns a stop function for the stream.
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
      console.log('status', event.data.ok);
    }
  },
  { credentials: 'include' },
);

if(err) {
  return new Error('some error-handling', { cause: err });
}

// Closer
close();
```

#### Options
Options mirrors fetch options except method/body/keepalive, plus SSE extras:
```ts
{
  validate?: boolean;               // override client/default validation for this stream
  timeout?: number | false;         // abort opening/reads after the given ms (falls back to client default); false disables timeout
  headers?: HeadersInit;            // extra headers merged into the SSE request (defaults include Accept: text/event-stream and Connection: keep-alive)
  credentials?: RequestCredentials; // forwarded to the underlying fetch call
  signal?: AbortSignal;             // aborts the SSE stream when triggered
  errorUnknownType?: boolean;       // when true, unknown event types call the handler with an error; when false (default), they are ignored
}
  ```

- The client builds URLs with path/query validation just like HTTP requests.
- Messages are parsed as JSON and validated against the typed event schema by default; set `validate: false` per-call to skip.
- Unknown event names are ignored unless you pass `errorUnknownType: true`, which forwards an error to the handler.
- The handler is error-first: it receives either `[err, null]` or `[null, { type, data }]` with latter allows for type-narrowing.

## Caching

GET requests can use an in-memory cache.

- Per-call: `client.get('/users', params, { cacheRequest: true, cacheTimeToLive: 60_000 })`
- Global cache defaults (applied when `cacheRequest` is true): `new RequestClient({ ..., cacheOpts: { ttl: 60_000, cleanupInterval: 30_000 } })`

Cache keys are derived from the constructed URL. When `cacheRequest` is enabled, cached data is returned until the TTL expires (per-call TTL wins; otherwise the cache client's `ttl` is used).

Be careful when enabling caching across callers: the cache is local to the client instance and keyed by URL plus headers. If two requests hit the same URL, the only reliable way to guarantee they do not overlap in the cache is to vary the headers (e.g., swap in a distinguishing header value) so the derived key changes.

In general, to avoid any issues, avoid caching sensitive data.

## Retries

Configure retries via `retry` on request options (or globally in the client constructor). Default retriable codes: 408, 429, 500–504. Be careful enabling retries on non-idempotent verbs (POST/PATCH/PUT/DELETE) to avoid duplicate side effects.

- Number only: `retry: 3` (just a limit)
- Custom object:

```ts
const [err, data] = await client.get('/users', params, {
  retry: {
    limit: 5,                 // max retries (total attempts = limit + 1)
    statusCodes: [429, 500],  // retry only these statuses
    ignoreStatusCodes: [404], // never retry on these (skip retry)
    timeout: 500,             // wait 500ms between tries
  },
});
```

Example with a timeout focus:

```ts
const [err, res] = await client.post('/users', null, body, {
  timeout: 10_000,
  retry: { limit: 2, statusCodes: [408], timeout: 1000 },
});
```

## Error handling

`wiretyped/error` exports helpers for richer error handling:

```ts
import { HTTPError, getHttpError, isHttpError, isTimeoutError, unwrapErrorType } from 'wiretyped/error';

const [err, user] = await client.get('/users/{id}', { $path: { id: '123' } });
if (err) {
  const httpError = getHttpError(err);
  if (httpError) {
    console.error('error request failed with status', httpError.status);
    return _something_here_http_error_;
  } 
  
  if (isTimeoutError(err)) {
    console.error('error request timed out');
    return _something_here_timeout_error_;
  }

  return _something_here_general_error_;
}
```

### Error types

`wiretyped` returns `[error, data]` tuples; the `error` half is either `null`, one of the typed errors below, or a plain `Error` if the case is not covered by a custom class.

- `HTTPError`: Non-2xx HTTP response; inspect `.response` (cloned) for status/body.
- `ValidationError`: Request or response validation failed; `.issues` lists Standard Schema issues and the message includes them for logging.
- `TimeoutError`: Request exceeded the configured timeout (also used when opening SSE connections takes too long).
- `AbortError`: The request was deliberately aborted via `AbortController`/signal.
- `ConstructURLError`: URL building failed (bad/missing `$path` or `$search` values); `.url` holds the failing URL template/result.
- `RetrySuppressedError`: Retry loop stopped early because it hit a stop/ignore code or state, and told it to stop retrying; `.attempts` shows how many tries happened.
- `RetryExhaustedError`: Retry loop hit its limit and surfaced the final failure; `.attempts` shows total tries.

Use `isX` or `getX` helpers from `wiretyped/error` (e.g., `isHttpError`, `getValidationError`) to safely narrow or unwrap errors, even when they are nested in `cause`.

## Exposed entrypoints

- Root import (client, types, errors): `wiretyped`
- Core client and types: `wiretyped/core`
- Error helpers: `wiretyped/error`

## Providers

Defaults are `FetchClient` for HTTP. Override only if you need custom transports. 

### HTTP provider shape

```ts
interface FetchClientProvider {
  new (baseUrl: string, opts: FetchClientOptions): FetchClientProviderDefinition;
}

interface FetchClientProviderDefinition {
  get(url: string, opts: Omit<FetchOptions, 'method' | 'body'>): SafeWrapAsync<Error, FetchResponse>;
  put(url: string, opts: Omit<FetchOptions, 'method'>): SafeWrapAsync<Error, FetchResponse>;
  patch(url: string, opts: Omit<FetchOptions, 'method'>): SafeWrapAsync<Error, FetchResponse>;
  post(url: string, opts: Omit<FetchOptions, 'method'>): SafeWrapAsync<Error, FetchResponse>;
  delete(url: string, opts: Omit<FetchOptions, 'method' | 'body'>): SafeWrapAsync<Error, FetchResponse>;
  config(opts: FetchClientOptions): void;
}
```

## Building

Library builds are handled by Vite:

```sh
pnpm build
```

Outputs land in `dist/` as both ESM (`*.mjs`) and CJS (`*.cjs`) bundles, with declarations under `dist/types`.

## Tests

- Use Vitest with co-located files: prefer `*.test.ts` beside the code under test (e.g., `fetch/client.ts` and `fetch/client.test.ts` in the same folder).
- Keep tests focused and readable: arrange inputs, act, then assert. Prefer the error-first tuple ergonomics to mirror real usage.
- Stub external effects (fetch, timers, SSE) with lightweight fakes rather than hitting the network.
- Favor small, focused cases over large integration-style suites.

## Publishing

Publishing is automated via GitHub Actions on tags (`v*`). Keep versions in sync:

- npm: `package.json` `version`
- JSR: `jsr.json` `version`
- Trigger: push a tag `vX.Y.Z` matching `package.json` `version`

CI will build, smoke-test, and publish to npm and JSR if the version isn’t already published. Auto-tagging should happen on new versions pushed to main.

## Scripts

- `pnpm build` – generate bundles (Vite) and type declarations.
- `pnpm test` – run the Vitest suite.
- `pnpm check` – type-check without emitting output.
- `pnpm format:fix` / `pnpm lint:fix` / `pnpm fix` – Biome formatting and linting helpers.


## FAQ

**Why is the error first in the tuple?**  
So you can’t avoid handling it. Putting the error first forces you to look at it. If you still ignore it… that’s on you.

---

**How can I access the response with status code and all that?**  
You can’t, because you don’t need it.  
If you care about the status code, it’s almost always because of an error.  
On success, you care about the data, not the status code.  
If you feel you really need it, you’ve probably structured something wrong.

---

**Why always return both error and data?**  
So you don’t end up with “floaty” types.  
You either have an `error` defined *or* you have `data` defined.  
(If your data is legitimately `null`, then you only have to care about `error`.)
