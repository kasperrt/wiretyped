---
title: Retries
---

# Retries

Configure retries via `retry` on request options (or globally in the client constructor). Default retriable codes: 408, 429, 500-504.

Be careful enabling retries on non-idempotent verbs (POST/PATCH/PUT/DELETE) to avoid duplicate side effects.


## Options

`retry` can be a number (just a limit), or an object:

```ts
{
  limit?: number;               // How many times to retry (total attempts = limit + 1)
  timeout?: number;             // Ms between retries
  statusCodes?: number[];       // Only retry these statuses (defaults to 408, 429, 500-504 when omitted)
  ignoreStatusCodes?: number[]; // Never retry these statuses (wins over statusCodes)
}
```

## Rules

- `ignoreStatusCodes` wins over `statusCodes` (if a status appears in both, retries stop).
- If `statusCodes` is omitted, WireTyped retries on its default set (408, 429, 500-504).
- Timeouts are always retried (up to your retry limit).
- If an abort signal aborts, retries stop immediately (no subsequent attempts).


## Examples


Number only:

```ts
const [err, data] = await client.get('/users', params, { retry: 3 });
```

Custom object:

```ts
const [err, data] = await client.get('/users', params, {
  retry: {
    limit: 5,
    statusCodes: [429, 500],
    ignoreStatusCodes: [404],
    timeout: 500,
  },
});
```

## `statusCodes` + `ignoreStatusCodes` interaction

Ignore a status even if it’s normally retried:

```ts
const [err, data] = await client.get('/users', params, {
  retry: { limit: 2, ignoreStatusCodes: [429] }, // 429 is in the default retriable set, but this suppresses retries
});
```

Ignore takes precedence if both lists include the same status:

```ts
const [err, data] = await client.get('/users', params, {
  retry: { limit: 5, statusCodes: [404], ignoreStatusCodes: [404] }, // will NOT retry
});
```

Timeout-focused:

```ts
const [err, res] = await client.post('/users', null, body, {
  timeout: 10_000,
  retry: { limit: 2, statusCodes: [408], timeout: 1000 },
});
```

## What's next

- Learn SSE reconnection behavior and type narrowing in [`/guide/sse`](/guide/sse).
- Learn error helpers (`isErrorType`, `unwrapErrorType`) in [`/guide/errors`](/guide/errors).
