---
title: Client
---

# Client

## Constructing a client

```ts
import { RequestClient } from 'wiretyped';
import { endpoints } from './endpoints'; // your endpoint definitions

const client = new RequestClient({
  hostname: 'https://api.example.com',
  baseUrl: '/api',
  endpoints,
  validation: true,
  cacheOpts: { ttl: 60_000, cleanupInterval: 30_000 },
  fetchOpts: {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10_000,
    retry: { limit: 2, timeout: 1000 },
  },
});
```

## Client options

- `baseUrl` (required): Base path prepended to all endpoints (e.g., `https://api.example.com/`).
- `hostname` (required): Absolute hostname used when building URLs (keeps `url()` outputs absolute).
- `endpoints` (required): Your typed endpoint definitions (`RequestDefinitions`).
- `validation` (default `true`): Validate bodies using your schema definitions; can be overridden per call/stream.
- `cacheOpts`: In-memory cache defaults (used when `cacheRequest` is enabled for GET). See [`cacheOpts`](#cacheopts).
- `fetchOpts`: Default request options (headers/credentials/mode + WireTyped `timeout`/`retry`). See [`fetchOpts`](#fetchopts).
- `fetchProvider`: Optional custom fetch provider (transport). See [`/reference/providers`](/reference/providers).

### `cacheOpts`

Configure the in-memory cache store (used when `cacheRequest` is enabled per GET call):

```ts
{
  ttl?: number;              // Default cache TTL in ms (default 500)
  cleanupInterval?: number;  // How often to evict expired entries (default 30_000)
}
```

### `fetchOpts`

Default fetch options for all calls. In addition to stock fetch options, WireTyped supports `timeout` and `retry` here:

```ts
{
  headers?: Record<string, string>;  // Merged with defaults; adds { Accept: 'application/json' } by default
  credentials?: RequestCredentials;  // Passed to fetch
  mode?: RequestMode;                // Passed to fetch
  timeout?: number | false;          // Request timeout in ms (default 60_000). false disables
  retry?: number | {
    limit?: number;                  // How many times to retry (total attempts = limit + 1)
    timeout?: number;                // Ms between retries
    statusCodes?: number[];          // Status codes to retry
    ignoreStatusCodes?: number[];    // Status codes to never retry
  };
}
```

## Runtime config (optional)

Update defaults without recreating the client:

```ts
client.config({
  fetchOpts: {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
    retry: { limit: 1 },
    timeout: 10_000,
  },
  cacheOpts: { ttl: 5_000, cleanupInterval: 30_000 },
});
```

## Disposal

For short-lived clients (scripts/tests), call `client.dispose()` to clear timers, abort in-flight HTTP requests, and close ongoing SSE streams. If your custom fetch provider exposes `dispose`, it will be called too.

```ts
client.dispose();
```

## What's next

- Make requests (and learn `url`/`download`/`sse`) in [`/guide/methods`](/guide/methods).
- If you enable GET caching, read [`/guide/caching`](/guide/caching) for TTL/keying details.
- If you enable retries/timeouts, read [`/guide/retries`](/guide/retries) for behavior and examples.
