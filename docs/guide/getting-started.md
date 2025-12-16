---
title: Getting Started
---

# Getting Started

::: tip
All examples in this guide use `zod`, but WireTyped is built on `@standard-schema/spec`, so any Standard Schema compatible validator works. See https://standardschema.dev/ for the ecosystem.
:::

## Installation

```sh
pnpm add wiretyped
# or: npm install wiretyped
# or: npx jsr add @kasperrt/wiretyped
```

## Quick start

Define your endpoints (with the schema of your choice) and create a `RequestClient`.

### Path params
- Use `$path` when you want constrained values (e.g. enums for `/integrations/{provider}`).
- For dynamic segments that accept generic strings/numbers, you can omit `$path`; the URL template (e.g., `/users/{id}`) already infers string/number.

```ts
import { RequestClient, type RequestDefinitions } from 'wiretyped';
import { z } from 'zod'; // Or your standard-schema/spec of choice

const endpoints = {
  '/users/{id}': {
    get: {
      response: z.object({ id: z.string(), name: z.string() }),
    },
  },
} satisfies RequestDefinitions;

const client = new RequestClient({
  hostname: 'https://api.example.com',
  baseUrl: '/api',
  endpoints,
  validation: true,
});

const [err, user] = await client.get('/users/{id}', { id: '123' });
if (err) {
  return err;
}
console.log(user.name);
```

## Imports

npm + JSR:
- Default (recommended): `import { RequestClient, ...errors } from 'wiretyped'`

npm only (optional):
- Core-only: `import { RequestClient } from 'wiretyped/core'`
- Error-only: `import { HTTPError, unwrapErrorType, ... } from 'wiretyped/error'`

Prefer a single import? The root export works too:

```ts
import { RequestClient, type RequestDefinitions } from 'wiretyped';
```

## What's next

- Define your API shape in [`/guide/endpoints`](/guide/endpoints) (URL templates, `$path`/`$search`, request/response schemas).
- Configure defaults in [`/guide/client`](/guide/client) (`fetchOpts`, `cacheOpts`, validation).
- Learn call signatures and special operations in [`/guide/methods`](/guide/methods) (HTTP methods, `url`, `download`, `sse`).
- Want to contribute? See [`/guide/development`](/guide/development) (tests, scripts, docs).
