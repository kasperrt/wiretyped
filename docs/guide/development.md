---
title: Development
---

# Development

This repo has two layers of tests:

- Fast tests with Vitest (integration-style).
- End-to-end runtime tests where the same test cases are reused across Node, Bun, Deno, and browsers.

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

Run everything:

```sh
pnpm test
```

Vitest (fast):

```sh
pnpm test:integrations
```

End-to-end runtime matrix (Node + Bun + Deno + browser) (somewhat fast):

```sh
pnpm test:e2e
```

Notes:
- Browser E2E uses Playwright.
- Deno E2E runs with `--allow-net --allow-read --allow-run=node` (see `e2e/run-deno.ts`).

## Docs

Local docs dev server:

```sh
pnpm docs:dev
```
