import * as wiretyped from '../dist/index.mjs';
import { sleep } from '../dist/utils/sleep.mjs';
import { safeWrap, safeWrapAsync } from '../dist/utils/wrap.mjs';
import { createRemoteAdmin } from './admin.mjs';
import { endpoints } from './endpoints.mjs';
import { createE2EClient, getE2ETestCases, runE2ETestCases } from './suite.mjs';

function getFreePort() {
  const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 });
  const [_, addr] = safeWrap(() => listener.addr as Deno.NetAddr);
  listener.close();
  return addr.port;
}

async function waitForReady(url: string) {
  const start = Date.now();
  while (true) {
    const [_, res] = await safeWrapAsync(() => fetch(new URL('/__counts', url)));
    if (res?.ok) return;

    if (Date.now() - start > 2_000) {
      throw new Error('timeout waiting for e2e server to be ready');
    }

    await sleep(25);
  }
}

const port = await getFreePort();
const url = `http://127.0.0.1:${port}`;

const cmd = new Deno.Command('node', {
  args: ['e2e/server.mjs'],
  cwd: Deno.cwd(),
  stdout: 'inherit',
  stderr: 'inherit',
  env: {
    E2E_PORT: String(port),
    E2E_HOST: '127.0.0.1',
  },
});

const child = cmd.spawn();
await waitForReady(url);

const admin = createRemoteAdmin(url);
const client = createE2EClient({ wiretyped, endpoints, baseUrl: url });
const cases = getE2ETestCases({ wiretyped, client, admin });

const [errors, logs] = await runE2ETestCases(cases);
for (const line of logs) {
  console.log(line);
}

if (errors.length > 0) {
  console.error('\ndeno e2e errors:');
  for (const err of errors) {
    console.error(err?.stack ?? String(err));
  }
}

if (!errors?.length) {
  console.log('e2e successfully run in deno');
}

client.dispose?.();
child.kill('SIGTERM');

const status = await Promise.race([child.status, sleep(2_000).then(() => null)]);
if (!status) {
  child.kill('SIGKILL');
}

const finalStatus = status ?? (await child.status);
if (!finalStatus.success) {
  console.error(`server process exited with code ${finalStatus.code ?? -1}`);
  Deno.exit(1);
}

Deno.exit(errors.length > 0 ? 1 : 0);
