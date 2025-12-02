// CJS types smoke: ensure declarations resolve for require() path
import type { RequestClient, RequestDefinitions } from 'wiretyped/core';
const core = require('wiretyped/core') as typeof import('wiretyped/core');
const { z } = require('zod') as typeof import('zod');

const endpoints = {
  '/ping': {
    get: { response: z.object({ ok: z.boolean() }) },
  },
} satisfies RequestDefinitions;

// Type-level smoke: ensure the client type is usable
type Ping = Awaited<ReturnType<RequestClient<typeof endpoints>['get']>>;
export type _AssertPingCjs = Ping;
