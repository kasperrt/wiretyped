---
title: Development
---

# Development

This repo has two layers of tests:

- Fast tests with Vitest (integration-style).
- End-to-end runtime tests where the same test cases are reused across Node, Bun, Deno, browsers, and Cloudflare Workers (via Miniflare).

If you absolutely don't want to install `deno` and `bun`, all integration tests and end-to-end tests runs in actions as well.

Prerequisites:
- Node `25` (see `.nvmrc`; with nvm: `nvm install && nvm use`), but should be supported down to node 18 according to the end-to-end tests.
- Package manager is `pnpm` (see `package.json#packageManager`)

## Setup

```sh
pnpm install
```

## Common scripts

Typecheck + lint + format:

```sh
pnpm check
```

Fix formatting/lint issues:

```sh
pnpm fix
```

Build the library (and types):

```sh
pnpm build
```

## Tests

Run everything (requires `deno` and `bun`):

```sh
pnpm test
```

Vitest (fast):

```sh
pnpm test:integrations
```

End-to-end runtime matrix (Node + Bun + Deno + browser + workers), (requires `deno` and `bun`):

```sh
pnpm test:e2e
```

Notes:
- Browser E2E uses Playwright.
- Workers E2E uses Miniflare (`e2e/run-workers.mjs` + `e2e/worker-test.ts`).
- Deno E2E runs with `--allow-net --allow-read --allow-run=node` (see `e2e/run-deno.ts`).

## Docs

Local docs dev server:

```sh
pnpm docs:dev
```
