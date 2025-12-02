// CJS types smoke: ensure declarations resolve for require() path
const core = require('wiretyped/core') as typeof import('wiretyped/core');
const { z } = require('zod') as typeof import('zod');

const endpoints = {
  '/ping': {
    get: { response: z.object({ ok: z.boolean() }) },
  },
} satisfies core.RequestDefinitions;

// Type-level smoke: ensure the client type is usable
type Ping = Awaited<ReturnType<core.RequestClient<typeof endpoints>['get']>>;
export type _AssertPingCjs = Ping;
