---
title: Endpoints
---

# Endpoints

WireTyped is typed from your endpoint definitions (`RequestDefinitions`). Each key is a URL template (e.g. `'/users/{id}'`) and each method (`get`, `post`, `sse`, …) describes its params/bodies/responses (see [`/guide/methods`](/guide/methods) for method signatures and options).

## Params

### `$path`

`$path` validates constrained path params (useful for enums).

### `$search`

`$search` validates query params.

::: info
If `$search` is optional in the schema and you want to omit query params, you must pass `$search: undefined` explicitly when you pass a params object.
:::

### Notes

- For simple dynamic path segments (string/number), you can omit `$path` and pass `{ id: '...' }` directly.
- If an endpoint doesn’t accept any params, pass `null` for the `params` argument to be explicit and readable (“no variables/params here”).

```ts
import { z } from 'zod'; // Or your standard-schema/spec of choice
import type { RequestDefinitions } from 'wiretyped';

export const endpoints = {
  '/users': {
    get: {
      $search: z.object({ limit: z.number().optional() }).optional(),
      response: z.array(z.object({ id: z.string() })),
    },
    post: {
      request: z.object({ name: z.string(), email: z.string().email() }),
      response: z.object({ id: z.string(), name: z.string(), email: z.string() }),
    },
  },
  '/integrations/{provider}': {
    get: {
      $path: z.object({ provider: z.enum(['slack', 'github']) }),
      response: z.object({
        provider: z.enum(['slack', 'github']),
        status: z.string(),
      }),
    },
  },
} satisfies RequestDefinitions;
```

## Request and response schemas

### `request`

For HTTP methods that accept a body (`post`, `put`, `patch`), `request` describes the body that gets sent. It’s used both for runtime validation (when enabled) and for TypeScript type inference of the `body` argument.

```ts
{
  post: {
    request: z.object({ name: z.string() }),
    response: z.object({ id: z.string() }),
  }
}
```

### `response`

`response` describes what WireTyped returns as `data` after parsing. It’s used both for runtime validation (when enabled) and for TypeScript type inference of the returned `data`.

```ts
{
  get: {
    response: z.object({ id: z.string() })
  }
}
```

## Client usage edge cases (POST examples)

```ts
import { RequestClient, type RequestDefinitions } from 'wiretyped';
import { z } from 'zod'; // Or your standard-schema/spec of choice

const endpoints = {
  // No params -> pass `null`
  '/users': {
    post: {
      request: z.object({ name: z.string() }),
      response: z.object({ id: z.string() }),
    },
  },

  // Optional $search -> pass `{ $search: undefined }` explicitly when omitting query params
  '/users/searchable': {
    post: {
      $search: z.object({ invite: z.boolean() }).optional(),
      request: z.object({ name: z.string() }),
      response: z.object({ id: z.string() }),
    },
  },

  // Constrained path params -> use `$path`
  '/integrations/{provider}': {
    post: {
      $path: z.object({ provider: z.enum(['slack', 'github']) }),
      request: z.object({ enabled: z.boolean() }),
      response: z.object({ ok: z.boolean() }),
    },
  },
} satisfies RequestDefinitions;

const client = new RequestClient({
  hostname: 'https://api.example.com',
  baseUrl: '/api',
  endpoints,
});

await client.post('/users', null, { name: 'Ada' });

await client.post('/users/searchable', { $search: undefined }, { name: 'Ada' });
await client.post('/users/searchable', { $search: { invite: true } }, { name: 'Ada' });

await client.post('/integrations/{provider}', { $path: { provider: 'slack' } }, { enabled: true });
```

## Example: all operations

You’ll typically spread operations across multiple URL templates. This example shows all supported operations:

```ts
import { z } from 'zod'; // Or your standard-schema/spec of choice
import type { RequestDefinitions } from 'wiretyped';

export const exampleEndpoints = {
  '/users': {
    get: {
      $search: z.object({ limit: z.number().optional() }).optional(),
      response: z.array(z.object({ id: z.string(), name: z.string() })),
    },
    post: {
      request: z.object({ name: z.string() }),
      response: z.object({ id: z.string() }),
    },
  },
  '/users/{id}': {
    put: {
      request: z.object({ name: z.string() }),
      response: z.object({ id: z.string(), name: z.string() }),
    },
    patch: {
      request: z.object({ name: z.string().optional() }),
      response: z.object({ id: z.string(), name: z.string() }),
    },
    delete: {
      response: z.object({ deleted: z.boolean() }),
    },
  },
  '/files/{id}/download': {
    download: {
      response: z.instanceof(Blob),
    },
  },
  '/links': {
    url: {
      response: z.string().url(),
    },
  },
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

## Standard Schema

WireTyped can validate request/response bodies using Standard Schema-compatible definitions (for example, Zod).

- Validation is enabled by default; you can opt out globally with `new RequestClient({ ..., validation: false })`.
- Override per request/stream: `{ validate: false }`

## What's next

- Configure defaults and runtime config in [`/guide/client`](/guide/client).
- Use the definitions in real calls in [`/guide/methods`](/guide/methods).
