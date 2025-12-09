#!/usr/bin/env node
import assert from 'node:assert';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const distDir = new URL('../dist/', import.meta.url);

const paths = {
  index: { esm: new URL('index.mjs', distDir), cjs: new URL('index.cjs', distDir) },
  core: { esm: new URL('core.mjs', distDir), cjs: new URL('core.cjs', distDir) },
  error: { esm: new URL('error.mjs', distDir), cjs: new URL('error.cjs', distDir) },
};

await Promise.all(Object.values(paths).flatMap((entry) => [access(entry.esm), access(entry.cjs)]));

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
  'RetrySuppressedError',
  'RetryExhaustedError',
  'isRetrySuppressedError',
  'getRetrySuppressedError',
  'isRetryExhaustedError',
  'getRetryExhaustedError',
];

const expectedErrorExports = [...expectedRootErrorExports, 'unwrapErrorType', 'isErrorType'];

const require = createRequire(import.meta.url);

const checkRoot = (mod, label) => {
  assert.strictEqual(typeof mod.RequestClient, 'function', `${label} RequestClient export missing`);
  expectedRootErrorExports.forEach((key) => {
    assert.ok(mod[key], `${label} ${key} export missing`);
  });
};

const checkCore = (mod, label) => {
  assert.strictEqual(typeof mod.RequestClient, 'function', `${label} RequestClient export missing`);
};

const checkError = (mod, label) => {
  expectedErrorExports.forEach((key) => {
    assert.ok(mod[key], `${label} ${key} export missing`);
  });
};

// Root ESM/CJS
const rootEsm = await import(paths.index.esm);
checkRoot(rootEsm, 'ESM root');
const rootCjs = require(fileURLToPath(paths.index.cjs));
checkRoot(rootCjs, 'CJS root');

// Tree-shaken core
const coreEsm = await import(paths.core.esm);
checkCore(coreEsm, 'ESM core');
const coreCjs = require(fileURLToPath(paths.core.cjs));
checkCore(coreCjs, 'CJS core');

// Tree-shaken error
const errorEsm = await import(paths.error.esm);
checkError(errorEsm, 'ESM error');
const errorCjs = require(fileURLToPath(paths.error.cjs));
checkError(errorCjs, 'CJS error');

console.log('Smoke test passed: dist/* exports load (root/core/error, ESM + CJS)');
