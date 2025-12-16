import * as wiretyped from '../dist/index.mjs';
import { createRemoteAdmin } from './admin.mjs';
import { endpoints } from './endpoints.mjs';
import { startE2EServer } from './server.mjs';
import { createE2EClient, getE2ETestCases, runE2ETestCases } from './suite.mjs';

const [errServer, server] = await startE2EServer(endpoints);
if (errServer || !server) {
  throw errServer ?? new Error('failed to start e2e server');
}

const admin = createRemoteAdmin(server.url);
const client = createE2EClient({ wiretyped, endpoints, baseUrl: server.url });
const cases = getE2ETestCases({ wiretyped, client, admin });

const [errors, logs] = await runE2ETestCases(cases);
for (const line of logs) {
  console.log(line);
}

if (errors.length > 0) {
  console.error('\nbun e2e errors:');
  for (const err of errors) {
    console.error(err?.stack ?? String(err));
  }
}

if (!errors?.length) {
  console.log('e2e successfully run in bun');
}

client.dispose?.();
await server.close();

process.exit(errors.length > 0 ? 1 : 0);
