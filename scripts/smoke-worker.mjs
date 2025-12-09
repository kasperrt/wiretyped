// Worker smoke: ensure bundles load inside a worker context
import { Worker } from 'node:worker_threads';

const distDir = new URL('../dist/', import.meta.url);
const paths = {
  index: { esm: new URL('index.mjs', distDir).href, cjs: new URL('index.cjs', distDir).href },
  core: { esm: new URL('core.mjs', distDir).href, cjs: new URL('core.cjs', distDir).href },
  error: { esm: new URL('error.mjs', distDir).href, cjs: new URL('error.cjs', distDir).href },
};

const expectedRootErrorExports = [
  'AbortError',
  'TimeoutError',
  'HTTPError',
  'getHttpError',
  'isAbortError',
  'isHttpError',
  'isTimeoutError',
  'RetrySuppressedError',
  'RetryExhaustedError',
  'isRetrySuppressedError',
  'getRetrySuppressedError',
  'isRetryExhaustedError',
  'getRetryExhaustedError',
  'ConstructURLError',
  'isConstructURLError',
  'getConstructURLError',
];

const expectedErrorExports = [...expectedRootErrorExports, 'unwrapErrorType', 'isErrorType'];

const workerSource = `
  import assert from 'node:assert';
  import { createRequire } from 'node:module';
  import { fileURLToPath } from 'node:url';
  import { parentPort, workerData } from 'node:worker_threads';

  const { paths, expectedRootErrorExports, expectedErrorExports } = workerData;

  const require = createRequire(import.meta.url);

  const checkRoot = (mod, label) => {
    assert.strictEqual(typeof mod.RequestClient, 'function', \`\${label} RequestClient export missing\`);
    expectedRootErrorExports.forEach((key) => {
      assert.ok(mod[key], \`\${label} \${key} export missing\`);
    });
  };

  const checkCore = (mod, label) => {
    assert.strictEqual(typeof mod.RequestClient, 'function', \`\${label} RequestClient export missing\`);
  };

  const checkError = (mod, label) => {
    expectedErrorExports.forEach((key) => {
      assert.ok(mod[key], \`\${label} \${key} export missing\`);
    });
  };

  const run = async () => {
    const rootEsm = await import(paths.index.esm);
    checkRoot(rootEsm, 'Worker ESM root');
    const rootCjs = require(fileURLToPath(paths.index.cjs));
    checkRoot(rootCjs, 'Worker CJS root');

    const coreEsm = await import(paths.core.esm);
    checkCore(coreEsm, 'Worker ESM core');
    const coreCjs = require(fileURLToPath(paths.core.cjs));
    checkCore(coreCjs, 'Worker CJS core');

    const errorEsm = await import(paths.error.esm);
    checkError(errorEsm, 'Worker ESM error');
    const errorCjs = require(fileURLToPath(paths.error.cjs));
    checkError(errorCjs, 'Worker CJS error');

    parentPort.postMessage({ ok: true });
  };

  run().catch((err) => {
    parentPort.postMessage({ ok: false, error: err?.message ?? String(err) });
  });
`;

const worker = new Worker(workerSource, {
  eval: true,
  workerData: {
    paths,
    expectedRootErrorExports,
    expectedErrorExports,
  },
  type: 'module',
});

const result = await new Promise((resolve, reject) => {
  worker.once('message', resolve);
  worker.once('error', reject);
});

if (!result?.ok) {
  throw new Error(`Worker smoke failed: ${result?.error ?? 'unknown error'}`);
}

console.log('Worker smoke passed');
