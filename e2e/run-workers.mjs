import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { safeWrapAsync } from '../dist/utils/wrap.mjs';
import { endpoints } from './endpoints.mjs';
import { startE2EServer } from './server.mjs';

// Build worker bundle (includes zod + suite code)
await new Promise((resolveBuild, rejectBuild) => {
  const proc = spawn('pnpm', ['exec', 'vite', 'build', '--config', 'e2e/vite.config.mjs', '--mode', 'worker'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  proc.on('error', rejectBuild);
  proc.on('exit', (code) => {
    if (code === 0) resolveBuild();
    else rejectBuild(new Error(`vite build failed with exit code ${code ?? -1}`));
  });
});

const [err, server] = await startE2EServer(endpoints);
if (err || !server) {
  throw err ?? new Error('failed to start e2e server');
}

const workerScriptPath = fileURLToPath(new URL('./dist/worker-test.mjs', import.meta.url));

const mf = new Miniflare({
  scriptPath: workerScriptPath,
  modules: true,
  compatibilityDate: '2024-11-01',
});

const [errDispatch, res] = await safeWrapAsync(() =>
  mf.dispatchFetch(`http://localhost/__wiretyped_e2e__?baseUrl=${encodeURIComponent(server.url)}`),
);
if (errDispatch) {
  throw new Error('error dispatching', { cause: errDispatch });
}

const result = await res.json();
for (const line of result?.logs ?? []) {
  console.log(line);
}

if (result?.errors?.length) {
  console.error('\nworkers e2e errors:');
  for (const err of result.errors) {
    console.error(err);
  }
}

assert(result?.ok === true, 'workers e2e failed');
console.log('e2e successfully run in cloudflare workers (miniflare)');

await mf.dispose();
await server.close();

process.exit(0);
