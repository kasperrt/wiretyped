// ESM types smoke: ensure declarations resolve for the package root

import type { RequestClient, RequestDefinitions } from 'wiretyped';
import { HTTPError, isHttpError } from 'wiretyped';
import { z } from 'zod';

const endpoints = {
  '/ping': {
    get: { response: z.object({ ok: z.boolean() }) },
  },
} satisfies RequestDefinitions;

// Type-level smoke: ensure the client type is usable
type Ping = Awaited<ReturnType<RequestClient<typeof endpoints>['get']>>;
export type _AssertPing = Ping;

// Root entrypoint should expose the same client/types
type RootPing = Awaited<ReturnType<RequestClient<typeof endpoints>['get']>>;
export type _AssertRootPing = RootPing;

type Assert<T extends true> = T;

// Ensure error-first tuple shape stays intact
type _AssertGetTupleShape = Assert<
  Awaited<ReturnType<RequestClient<typeof endpoints>['get']>> extends [Error, null] | [null, { ok: boolean }]
    ? true
    : false
>;

// Error entrypoint should expose error helpers
const httpError = new HTTPError(new Response(null, { status: 500 }));
export const _assertIsHttpError: boolean = isHttpError(httpError);
