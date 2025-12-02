// ESM types smoke: ensure declarations resolve for ESM import path
import type { RequestClient, RequestDefinitions } from 'wiretyped/core';
import { z } from 'zod';

const endpoints = {
  '/ping': {
    get: { response: z.object({ ok: z.boolean() }) },
  },
} satisfies RequestDefinitions;

// Type-level smoke: ensure the client type is usable
type Ping = Awaited<ReturnType<RequestClient<typeof endpoints>['get']>>;
// @ts-expect-error
const _unused: Ping | null = null;
