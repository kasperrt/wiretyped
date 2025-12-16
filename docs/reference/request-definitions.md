---
title: Request Definitions
outline: deep
---

# Request Definitions

`RequestDefinitions` is the TypeScript type that powers WireTyped's endpoint definitions. You give WireTyped an object of URL templates and method definitions, and it gives you:

- Typed params (`$path`, `$search`, and `{param}` segments)
- Typed request bodies (when the method accepts a body)
- Typed response data

This page focuses on what you can put in the endpoint definition object. For how to call each method, see [`/guide/methods`](/guide/methods).

## Shape

At a high level:

```ts
import type { RequestDefinitions } from 'wiretyped';

export const endpoints = {
  '/some/path': {
    get: { response: /* schema */ },
    post: { request: /* schema */, response: /* schema */ },
  },
} satisfies RequestDefinitions;
```

Each key is a URL template string:

- `/users/{id}` uses `{id}` as a path param (typed as `string | number`)
- `$path` can be used to constrain or validate path params (e.g. enums)
- `$search` describes query params

## `$path`

Use `$path` to validate and type path params (useful for enums):

```ts
import { z } from 'zod'; // Or your standard-schema/spec of choice
import type { RequestDefinitions } from 'wiretyped';

export const endpoints = {
  '/integrations/{provider}': {
    get: {
      $path: z.object({ provider: z.enum(['slack', 'github']) }),
      response: z.object({ ok: z.boolean() }),
    },
  },
} satisfies RequestDefinitions;
```

## `$search`

Use `$search` to validate and type query params:

```ts
import { z } from 'zod'; // Or your standard-schema/spec of choice
import type { RequestDefinitions } from 'wiretyped';

export const endpoints = {
  '/users': {
    get: {
      $search: z.object({ limit: z.number().optional() }),
      response: z.array(z.object({ id: z.string() })),
    },
  },
} satisfies RequestDefinitions;
```

::: info
If `$search` is optional in the schema and you want to omit query params, you must pass `$search: undefined` explicitly when you pass a params object.
:::

## `request`

For HTTP methods that accept a body (`post`, `put`, `patch`), `request` describes the body you send:

```ts
import { z } from 'zod'; // Or your standard-schema/spec of choice
import type { RequestDefinitions } from 'wiretyped';

export const endpoints = {
  '/users': {
    post: {
      request: z.object({ name: z.string() }),
      response: z.object({ id: z.string() }),
    },
  },
} satisfies RequestDefinitions;
```

This is used for runtime validation (when enabled) and for TypeScript type inference of the `body` argument.

## `response`

All methods have a `response` schema:

- For `get`/`post`/`put`/`patch`/`delete`, it describes the parsed data returned as `data`.
- For `download`, it should be a `Blob` schema (the client returns a `Blob`).
- For `url`, it is a string schema (usually `z.string().url()`), and WireTyped validates the final generated URL string against it.

```ts
import { z } from 'zod'; // Or your standard-schema/spec of choice
import type { RequestDefinitions } from 'wiretyped';

export const endpoints = {
  '/users/{id}': {
    get: { response: z.object({ id: z.string() }) },
  },
  '/files/{id}/download': {
    download: { response: z.instanceof(Blob) },
  },
  '/links': {
    url: { response: z.string().url() },
  },
} satisfies RequestDefinitions;
```

## `events` (SSE)

For `sse`, you define an `events` map of event name to schema:

```ts
import { z } from 'zod'; // Or your standard-schema/spec of choice
import type { RequestDefinitions } from 'wiretyped';

export const endpoints = {
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

## Params and `null`

When a method has no params, pass `null` for the `params` argument to be explicit:

```ts
await client.post('/users', null, body);
```

## What's next

- See the full option shapes in [`/reference/options`](/reference/options).
- Learn how calls are structured in [`/guide/methods`](/guide/methods).
