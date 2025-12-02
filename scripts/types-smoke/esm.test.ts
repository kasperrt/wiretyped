// ESM types smoke: ensure declarations resolve for ESM import path
import { RequestClient, type RequestDefinitions, z } from 'wiretyped/core';

const endpoints = {
  '/ping': {
    get: { response: z.object({ ok: z.boolean() }) },
  },
} satisfies RequestDefinitions;

// Type-level smoke: ensure the client type is usable
type Ping = Awaited<ReturnType<RequestClient<typeof endpoints>['get']>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _: Ping | null = null;
