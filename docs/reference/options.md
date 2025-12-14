---
title: Options
outline: deep
---

# Options

This page summarizes the option objects WireTyped accepts. For usage examples, see [`/guide/client`](/guide/client) and [`/guide/methods`](/guide/methods).

## Client options

These are the options passed to `new RequestClient({ ... })`:

```ts
{
  hostname: string;
  baseUrl: string;
  endpoints: RequestDefinitions;
  validation?: boolean;
  fetchProvider?: FetchClientProvider;
  
  cacheOpts?: {
    ttl?: number;
    cleanupInterval?: number;
  };

  fetchOpts?: {
    headers?: Record<string, string>;
    credentials?: RequestCredentials;
    mode?: RequestMode;
    timeout?: number | false;
    retry?: number | {
      limit?: number;
      timeout?: number;
      statusCodes?: number[];
      ignoreStatusCodes?: number[];
    };
  };
}
```

Notes:

- `fetchProvider` is only needed for custom transports. See [`/reference/providers`](/reference/providers).
- `fetchOpts` includes `timeout` and `retry` which are WireTyped-specific defaults.

## Per request options

Per call options are passed as the last argument to methods like `get`, `post`, etc:

```ts
{
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  mode?: RequestMode;
  signal?: AbortSignal;

  timeout?: number | false;
  retry?: number | {
    limit?: number;
    timeout?: number;
    statusCodes?: number[];
    ignoreStatusCodes?: number[];
  };

  validate?: boolean;

  // GET only
  cacheRequest?: boolean;
  cacheTimeToLive?: number;
}
```

Notes:

- `validate` overrides the client default for that one call/stream.
- If `signal` aborts, retries stop and the request returns immediately with an abort error.

## What's next

- Define endpoints in [`/reference/request-definitions`](/reference/request-definitions).
- See runtime provider interfaces in [`/reference/providers`](/reference/providers).

