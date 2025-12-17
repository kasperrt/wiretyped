import * as error from '../dist/error.mjs';
import * as wiretyped from '../dist/index.mjs';
import { createRemoteAdmin } from './admin.mjs';
import { endpoints } from './endpoints.mjs';
import { createE2EClient, getE2ETestCases, runE2ETestCases } from './suite.mjs';

function json(value: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init?.headers ?? {}),
    },
  });
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === '/__health') {
      return json({ ok: true });
    }

    if (url.pathname !== '/__wiretyped_e2e__') {
      return new Response('Not found', { status: 404 });
    }

    const baseUrl = url.searchParams.get('baseUrl');
    if (!baseUrl) {
      return json({ ok: false, errors: ['Missing ?baseUrl='], logs: [] }, { status: 400 });
    }

    const admin = createRemoteAdmin(baseUrl);
    const client = createE2EClient({ wiretyped: { ...wiretyped, ...error }, endpoints, baseUrl });
    const cases = getE2ETestCases({ wiretyped: { ...wiretyped, ...error }, client, admin });

    const [errors, logs] = await runE2ETestCases(cases);
    const errorStrings = errors.map((e) => (e instanceof Error ? (e.stack ?? e.message) : String(e)));

    client.dispose?.();

    return json({ ok: errors.length === 0, logs, errors: errorStrings }, { status: 200 });
  },
};
