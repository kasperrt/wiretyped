#!/usr/bin/env node
import assert from 'node:assert';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const distDir = new URL('../dist/', import.meta.url);

const paths = {
  index: { esm: new URL('index.mjs', distDir), cjs: new URL('index.cjs', distDir) },
};

await Promise.all(Object.values(paths.index).map((entry) => access(entry)));

const expectedRootErrorExports = [
  'AbortError',
  'TimeoutError',
  'HTTPError',
  'getHttpError',
  'isAbortError',
  'isHttpError',
  'isTimeoutError',
  'ValidationError',
  'getValidationError',
  'isValidationError',
];

const require = createRequire(import.meta.url);

const checkRoot = (mod, label) => {
  assert.strictEqual(typeof mod.RequestClient, 'function', `${label} RequestClient export missing`);
  expectedRootErrorExports.forEach((key) => {
    assert.ok(mod[key], `${label} ${key} export missing`);
  });
};

// Root ESM/CJS
const rootEsm = await import(paths.index.esm);
checkRoot(rootEsm, 'ESM root');
const rootCjs = require(fileURLToPath(paths.index.cjs));
checkRoot(rootCjs, 'CJS root');

console.log('Smoke test passed: dist root entrypoint loads (ESM + CJS)');
