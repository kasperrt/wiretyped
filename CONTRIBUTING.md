# Contributing to WireTyped

Thanks for your interest in improving WireTyped! This guide covers the basics for developing, testing, and submitting changes.

## Development setup

1. Install pnpm (v10+ recommended).
2. Install deps: `pnpm install --frozen-lockfile`
3. Run checks locally:
   - Lint/format/types: `pnpm run check`
   - Tests: `pnpm test` (unit/integration + Node e2e) and `pnpm test:coverage` for coverage
   - Build: `pnpm run build` (types only: `pnpm run build:types`)
   - E2E (all runtimes): `pnpm run test:e2e:node`, `pnpm run test:e2e:bun`, `pnpm run test:e2e:deno`, `pnpm run test:e2e:browser`
   - Smoke (non-overlapping): `pnpm run smoke:entrypoints`, `pnpm run smoke:resolve`, `pnpm run smoke:pack`, `pnpm run smoke:dts`, and always `pnpm run smoke:types`

Note: GitHub Actions will run lint/format/types, tests, e2e (all runtimes), and the remaining smoke checks on PRs. All of these are required to pass before changes can be merged.

## Workflow

1. Fork and branch from `main`.
2. Make changes with tests/coverage where applicable.
3. Ensure `pnpm run check` and `pnpm run test` pass.
4. Open a PR with a clear summary and any relevant notes (breaking changes, migration steps).

## Coding guidelines

- Type-first: keep strong typing with Standard Schema; avoid `any`.
- Error handling: prefer safe tuple wrappers (`safeWrap`/`safeWrapAsync`) for consistency, not `try`/`catch` blocks.
- Formatting/linting: use `pnpm run fix` to apply Biome rules.
- Comments: keep them concise and only where they add clarity.
- If you have to `else`, think again.

## Reporting issues

Use the GitHub issue templates. Include reproduction steps, versions, runtime/OS info, and logs/screenshots.
