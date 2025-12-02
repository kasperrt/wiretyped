# Contributing to WireTyped

Thanks for your interest in improving WireTyped! This guide covers the basics for developing, testing, and submitting changes.

## Development setup

1. Install pnpm (v10+ recommended).
2. Install deps: `pnpm install --frozen-lockfile`
3. Run checks locally:
   - Lint/format/types: `pnpm run check`
   - Tests: `pnpm test` (and `pnpm test:coverage` to verify coverage)
   - Build: `pnpm run build` (types only: `pnpm run build:types`)
   - Smokes: run per runtime (e.g., `pnpm run smoke:node`, `pnpm run smoke:worker`, `bun run scripts/smoke-bun.ts`, `deno run --allow-read scripts/smoke-deno.ts`) and always `pnpm run smoke:types`

## Workflow

1. Fork and branch from `main`.
2. Make changes with tests/coverage where applicable.
3. Ensure `pnpm run check` and `pnpm run test` pass.
4. Open a PR with a clear summary and any relevant notes (breaking changes, migration steps).

## Coding guidelines

- Type-first: keep strong typing with Standard Schema; avoid `any`.
- Error handling: prefer safe tuple wrappers (`safeWrap`/`safeWrapAsync`) for consistency.
- Formatting/linting: use `pnpm run fix` to apply Biome rules.
- Comments: keep them concise and only where they add clarity.
- If you have to `else`, think again.

## Reporting issues

Use the GitHub issue templates. Include reproduction steps, versions, runtime/OS info, and logs/screenshots.
