import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { endpoints } from './endpoints.mjs';
import { startE2EServer } from './server.mjs';

// Build browser bundle (includes zod + suite code)
await new Promise((resolveBuild, rejectBuild) => {
  const proc = spawn('pnpm', ['exec', 'vite', 'build', '--config', 'e2e/vite.config.mjs'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  proc.on('error', rejectBuild);
  proc.on('exit', (code) => {
    if (code === 0) {
      resolveBuild();
      return;
    }

    rejectBuild(new Error(`vite build failed with exit code ${code ?? -1}`));
  });
});

const [err, server] = await startE2EServer(endpoints);
if (err || !server) {
  throw err ?? new Error('failed to start e2e server');
}

const pageUrl = `${server.url}/browser-test.html`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(pageUrl, { waitUntil: 'load' });
await page.waitForFunction(() => window.__WIRETYPED_E2E_DONE__ !== undefined, { timeout: 20_000 });
const result = await page.evaluate(() => window.__WIRETYPED_E2E_DONE__);
for (const log of result?.logs ?? []) {
  console.log(log);
}

if (result?.errors?.length) {
  console.error('\nbrowser e2e errors:');
  for (const err of result.errors) {
    console.error(err);
  }
}

assert(result?.ok === true, 'browser e2e failed');
console.log('e2e successfully run in browser');

await browser.close();
await server.close();

process.exit(0);
