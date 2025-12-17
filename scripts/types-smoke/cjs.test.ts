// CJS types smoke: ensure declarations resolve for the package root

import { HTTPError, type RequestClient, type RequestDefinitions } from 'wiretyped';

const _root = require('wiretyped') as typeof import('wiretyped');
const { z } = require('zod') as typeof import('zod');

const endpoints = {
  '/ping': {
    get: { response: z.object({ ok: z.boolean() }) },
  },
} satisfies RequestDefinitions;

// Type-level smoke: ensure the client type is usable
type Ping = Awaited<ReturnType<RequestClient<typeof endpoints>['get']>>;
export type _AssertPingCjs = Ping;

// Root entrypoint should expose the same client/types
type RootPing = Awaited<ReturnType<RequestClient<typeof endpoints>['get']>>;
export type _AssertRootPingCjs = RootPing;

// Error helpers should be available from root
const _httpError = new _root.HTTPError(new Response(null, { status: 500 }));
export const _assertIsErrorTypeCjs: boolean = _root.isErrorType(HTTPError, _httpError);
