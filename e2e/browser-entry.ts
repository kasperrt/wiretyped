import * as wiretyped from '../dist/index.mjs';
import { createRemoteAdmin } from './admin.mjs';
import { endpoints } from './endpoints.mjs';
import { createE2EClient, getE2ETestCases, runE2ETestCases } from './suite.mjs';

declare global {
  interface Window {
    __WIRETYPED_E2E_DONE__?: { ok: boolean; logs: string[]; errors: string[] };
  }
}

const baseUrl = new URL(location.href).searchParams.get('baseUrl');
const resolvedBaseUrl = baseUrl ?? location.origin;

const admin = createRemoteAdmin(resolvedBaseUrl);
const client = createE2EClient({ wiretyped, endpoints, baseUrl: resolvedBaseUrl });
const cases = getE2ETestCases({ wiretyped, client, admin });

const [errors, logs] = await runE2ETestCases(cases);
const errorStrings = errors.map((e) => (e instanceof Error ? (e.stack ?? e.message) : String(e)));
window.__WIRETYPED_E2E_DONE__ = { ok: errors.length === 0, logs, errors: errorStrings };
