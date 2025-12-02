// CJS types smoke: ensure declarations resolve for require() path
// eslint-disable-next-line @typescript-eslint/no-var-requires
// @ts-expect-error
const core = require('wiretyped/core') as typeof import('wiretyped/core');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { z } = require('zod') as typeof import('zod');

const endpoints = {
  '/ping': {
    get: { response: z.object({ ok: z.boolean() }) },
  },
  // @ts-expect-error
} satisfies core.RequestDefinitions;

// Type-level smoke: ensure the client type is usable
// @ts-expect-error
type Ping = Awaited<ReturnType<core.RequestClient<typeof endpoints>['get']>>;
// @ts-expect-error
const _unused: Ping | null = null;
