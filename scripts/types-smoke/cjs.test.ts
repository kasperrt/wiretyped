// CJS types smoke: ensure declarations resolve for require() path
// eslint-disable-next-line @typescript-eslint/no-var-requires
const core = require('wiretyped/core') as typeof import('wiretyped/core');

const endpoints = {
  '/ping': {
    get: { response: core.z.object({ ok: core.z.boolean() }) },
  },
} satisfies core.RequestDefinitions;

// Type-level smoke: ensure the client type is usable
type Ping = Awaited<ReturnType<core.RequestClient<typeof endpoints>['get']>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _: Ping | null = null;
