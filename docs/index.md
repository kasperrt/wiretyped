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
  - title: Typed endpoints with validation
    details: Define endpoints once and get full TypeScript safety for params, bodies, and responses, with the added security of end-to-end validation.
  - title: Error-first tuples
    details: Every call returns [error, data] so control flow is explicit and predictable.
  - title: Built-in retries and caching
    details: Pragmatic helpers with minimal configuration for common API-client needs.
  - title: SSE support
    details: Typed server-sent events with optional validation and clean disposal.
  - title: Runtime errors
    details: Reduce “surprise” runtime errors with explicit, error-first control flow and predictable failure modes.
  - title: Cool guy
    details: We have a cool lil' guy as a mascot, just look at how happy he is you're here.
---

## What is it?

> Small and easy-to-use fetch based client with runtime validation


[![CI](https://github.com/kasperrt/wiretyped/actions/workflows/ci.yml/badge.svg)](https://github.com/kasperrt/wiretyped/actions/workflows/ci.yml) &nbsp; [![Coverage](https://codecov.io/gh/kasperrt/wiretyped/branch/main/graph/badge.svg)](https://codecov.io/gh/kasperrt/wiretyped) &nbsp; [![minzip](https://badgen.net/bundlephobia/minzip/wiretyped@latest)](https://bundlephobia.com/package/wiretyped@latest)

[![npm](https://img.shields.io/npm/v/wiretyped.svg)](https://www.npmjs.com/package/wiretyped) &nbsp; [![JSR](https://jsr.io/badges/@kasperrt/wiretyped)](https://jsr.io/@kasperrt/wiretyped)

WireTyped is a small, composable HTTP client for fetch-based runtimes (browser, Node, Bun, Deno, workers). You define your API as typed endpoint definitions and call it with a consistent, error-first API.

It keeps a tiny runtime surface area: one dependency, `@standard-schema/spec`, so you can bring your own validator (Zod, Valibot, ArkType, etc.) without dragging in a whole framework or a pile of transitive deps. 

I built it because I got tired of the same three problems: surprise runtime errors, wrapping every request in `try/catch`, and threading schemas + type inference through every call just to keep types strict and consistent. WireTyped centralizes that work in your endpoint definitions, so using the client stays predictable and pretty.

## Basic example

Define your endpoints once, then call them with a consistent `[err, data]` shape with convenient type-narrowing:

```ts
import { RequestClient, type RequestDefinitions } from 'wiretyped';
import { z } from 'zod'; // Or your standard-schema/spec of choice

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

If you’re nodding along and want to keep moving, jump into the quickstart: [`/guide/getting-started`](/guide/getting-started)
