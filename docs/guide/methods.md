---
title: Methods
outline: deep
---

# Methods

Each method is typed from your endpoint definitions and returns `[error, data]`.

## Request shape

Every call returns an error-first tuple: `[error, data]`. This pattern also gives you clean type narrowing: once you check `err` and return early, TypeScript knows `data` is present.

```ts
const [err, data] = await client.get('/users', null);
if (err) {
  return err;
}
```

## Request options

Per-call options mirror fetch options with extra WireTyped flags (and GET cache options):

```ts
{
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
  validate?: boolean;

  // GET only
  cacheRequest?: boolean;
  cacheTimeToLive?: number;
}
```

## Method signatures

- `get(endpointKey, params, options?)`
- `post(endpointKey, params, body, options?)`
- `put(endpointKey, params, body, options?)`
- `patch(endpointKey, params, body, options?)`
- `delete(endpointKey, params, options?)`
- `download(endpointKey, params, options?)`
- `url(endpointKey, params, options?)`
- `sse(endpointKey, params, handler, options?)`

## HTTP Methods

### GET

Uses HTTP `GET`. No request body. Validates params (like `$path` / `$search`) from the endpoint schema, and validates the parsed response with the endpoint’s `response` schema when validation is enabled.

```ts
const endpoints = {
  '/users': {
    get: {
      $search: z.object({ limit: z.number().optional() }).optional(),
      response: z.array(z.object({ id: z.string() })),
    },
  },
  '/integrations/{provider}': {
    get: {
      $path: z.object({ provider: z.enum(['slack', 'github']) }),
      response: z.object({ provider: z.enum(['slack', 'github']), status: z.string() }),
    },
  },
} satisfies RequestDefinitions;

const [err, users] = await client.get('/users', { $search: { limit: 10 } });
const [integrationErr, integration] = await client.get('/integrations/{provider}', {
  $path: { provider: 'slack' },
});
```

### POST

Uses HTTP `POST`. Takes a request body, validates it with the endpoint’s `request` schema, and validates the parsed response with the endpoint’s `response` schema when validation is enabled.

```ts
const endpoints = {
  '/users': {
    post: {
      request: z.object({ name: z.string(), email: z.string().email() }),
      response: z.object({ id: z.string(), name: z.string(), email: z.string() }),
    },
  },
} satisfies RequestDefinitions;

const [err, created] = await client.post('/users', null, { name: 'Ada', email: 'ada@example.com' });
```

### PUT

Uses HTTP `PUT`. Takes a request body, validates it with the endpoint’s `request` schema, and validates the parsed response with the endpoint’s `response` schema when validation is enabled.

```ts
const endpoints = {
  '/users/{id}': {
    put: {
      request: z.object({ name: z.string(), email: z.string().email() }),
      response: z.object({ id: z.string(), name: z.string(), email: z.string() }),
    },
  },
} satisfies RequestDefinitions;

const [err, updated] = await client.put('/users/{id}', { id: '123' }, { name: 'Ada', email: 'ada@ex.com' });
```

### PATCH

Uses HTTP `PATCH`. Takes a request body, validates it with the endpoint’s `request` schema, and validates the parsed response with the endpoint’s `response` schema when validation is enabled.

```ts
const endpoints = {
  '/users/{id}': {
    patch: {
      request: z.object({ name: z.string().optional() }),
      response: z.object({ id: z.string(), name: z.string() }),
    },
  },
} satisfies RequestDefinitions;

const [err, patched] = await client.patch('/users/{id}', { id: '123' }, { name: 'Ada Lovelace' });
```

### DELETE

Uses HTTP `DELETE`. No request body in WireTyped (and the HTTP spec generally discourages including a body on `DELETE`). Validates params from the endpoint schema, and validates the parsed response with the endpoint’s `response` schema when validation is enabled.

```ts
const endpoints = {
  '/users/{id}': {
    delete: { response: z.object({ deleted: z.boolean() }) },
  },
} satisfies RequestDefinitions;

const [err, deletion] = await client.delete('/users/{id}', { id: '123' });
```

## Special Methods

### DOWNLOAD

`download` performs an HTTP `GET` request under the hood, but handles the response as binary and returns a `Blob` instance (it uses `response.blob()` internally instead of JSON parsing).

```ts
const endpoints = {
  '/files/{id}/download': {
    download: { response: z.instanceof(Blob) },
  },
} satisfies RequestDefinitions;

const [err, file] = await client.download('/files/{id}/download', { id: 'file-1' });
```

### URL

```ts
const endpoints = {
  '/links': { url: { response: z.string().url() } },
} satisfies RequestDefinitions;

const [err, link] = await client.url('/links', null);
```

#### Why include it?

Use `url()` when you want a validated, parsed URL without making a request, e.g. to redirect a user, generate a link, or pass a trusted URL to another part of your app.

#### Why async?

`url()` generates a URL from the endpoint template + params and validates/parses the final result using the endpoint’s `url.response` schema. The “response” schema here is simply used to express that the return type is a string (and lets you attach extra validation like `z.string().url()`).

It’s async because Standard Schema validators can be async, so the API is async even though it doesn’t hit the network.


### SSE

Subscribe to server-sent events; returns a stop function for the stream.

It uses `fetch` under the hood (no `EventSource`, no extra dependencies), so it works anywhere `fetch` + streams are available.

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

const [err, close] = await client.sse(
  '/events',
  null,
  ([errEvent, event]) => {
    if (errEvent) {
      return console.error('sse error', errEvent);
    }
    if (event.type === 'message') {
      console.log('message', event.data.msg);
    }
    if (event.type === 'status') {
      console.log('status', event.data);
    }
  },
  { credentials: 'include' },
);

if (err) {
  return new Error('SSE failed to start', { cause: err });
}
close();
```

SSE options mirror fetch options except method/body/keepalive, plus:

```ts
{
  validate?: boolean;
  timeout?: number | false;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  signal?: AbortSignal;
  errorUnknownType?: boolean;
}
```

For more details (type narrowing, reconnection behavior, `Last-Event-ID`), see [`/guide/sse`](/guide/sse).

## What's next

- Add GET caching in [`/guide/caching`](/guide/caching) (TTL, cache keys, safety notes).
- Tune retry/timeout behavior in [`/guide/retries`](/guide/retries).
- Handle errors and unwrap causes in [`/guide/errors`](/guide/errors).
