---
title: Caching
---

# Caching

Cache keys are derived from the constructed URL (and headers). When `cacheRequest` is enabled, cached data is returned until the TTL expires (per-call TTL wins; otherwise the cache client’s `ttl` is used).

::: warning
Be careful when enabling caching across callers: the cache is local to the client instance and keyed by URL plus headers. If two requests hit the same URL, the only reliable way to guarantee they do not overlap in the cache is to vary the headers so the derived key changes.

In general, avoid caching sensitive data.
:::

GET requests can use an in-memory cache.

## Per-call

```ts
const [err, users] = await client.get('/users', params, {
  cacheRequest: true,
  cacheTimeToLive: 60_000,
});
```

## Global defaults

Applied when `cacheRequest` is `true`:

```ts
const client = new RequestClient({
  hostname: 'https://api.example.com',
  baseUrl: '/api',
  endpoints,
  cacheOpts: { ttl: 60_000, cleanupInterval: 30_000 },
});
```

## What's next

- Configure retry + timeout behavior in [`/guide/retries`](/guide/retries).
- See how errors are surfaced and unwrapped in [`/guide/errors`](/guide/errors).
