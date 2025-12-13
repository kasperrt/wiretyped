---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: WireTyped
  text: Typed HTTP client for fetch runtimes
  tagline: Universal fetch-based, typed HTTP client with error-first ergonomics, retries, caching, SSE, and Standard Schema validation.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: GitHub
      link: https://github.com/kasperrt/wiretyped

  image:
    src: /wiretyped.png
    alt: WireTyped

features:
  - title: Typed endpoints first
    details: Define endpoints once and get full TypeScript safety for params, bodies, and responses.
  - title: Error-first tuples
    details: Every call returns [error, data] so control flow is explicit and predictable.
  - title: Runtime validation (optional)
    details: Validate request/response bodies against Standard Schema-compatible schemas.
  - title: Built-in retries and caching
    details: Pragmatic helpers with minimal configuration for common API-client needs.
  - title: SSE support
    details: Typed server-sent events with optional validation and clean disposal.
  - title: Runtime errors
    details: Reduce “surprise” runtime errors with explicit, error-first control flow and predictable failure modes.
---

## What is it?

WireTyped is a small, composable HTTP client for fetch-based runtimes (browser, Node, Bun, Deno, workers). You define your API as typed endpoint definitions and call it with a consistent, error-first API.

## Quick taste

```ts
import { RequestClient, type RequestDefinitions } from 'wiretyped';
import { z } from 'zod';
// Or your standard-schema/spec of choice

const endpoints = {
  '/users/{id}': {
    get: { response: z.object({ id: z.string(), name: z.string() }) },
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

## Okay, wow

This is the part where you pause for a second and go: okay, yeah. This is kinda beautiful. Let’s keep going.

I got you: [`/guide/getting-started`](/guide/getting-started)
