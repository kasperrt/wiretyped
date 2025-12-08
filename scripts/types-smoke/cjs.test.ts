// CJS types smoke: ensure declarations resolve for every require() path

import type { RequestClient as RootRequestClient, RequestDefinitions as RootRequestDefinitions } from 'wiretyped';
import type { RequestClient, RequestDefinitions } from 'wiretyped/core';

const _core = require('wiretyped/core') as typeof import('wiretyped/core');
const _root = require('wiretyped') as typeof import('wiretyped');
const { z } = require('zod') as typeof import('zod');
const _error = require('wiretyped/error') as typeof import('wiretyped/error');

const endpoints = {
  '/ping': {
    get: { response: z.object({ ok: z.boolean() }) },
  },
} satisfies RequestDefinitions;

const rootEndpoints = {
  '/ping': {
    get: { response: z.object({ ok: z.boolean() }) },
  },
} satisfies RootRequestDefinitions;

// Type-level smoke: ensure the client type is usable
type Ping = Awaited<ReturnType<RequestClient<typeof endpoints>['get']>>;
export type _AssertPingCjs = Ping;

// Root entrypoint should expose the same client/types
type RootPing = Awaited<ReturnType<RootRequestClient<typeof rootEndpoints>['get']>>;
export type _AssertRootPingCjs = RootPing;

// Error entrypoint should expose error helpers
const _httpError = new _error.HTTPError(new Response(null, { status: 500 }));
export const _assertIsHttpErrorCjs: boolean = _error.isHttpError(_httpError);
