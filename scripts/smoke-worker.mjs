// Worker smoke: ensure bundles load inside a worker context
import { Worker } from 'node:worker_threads';

const distDir = new URL('../dist/', import.meta.url);
const paths = {
  index: { esm: new URL('index.mjs', distDir).href, cjs: new URL('index.cjs', distDir).href },
};

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

const workerSource = `
  import assert from 'node:assert';
  import { createRequire } from 'node:module';
  import { fileURLToPath } from 'node:url';
  import { parentPort, workerData } from 'node:worker_threads';

  const { paths, expectedRootErrorExports } = workerData;

  const require = createRequire(import.meta.url);

  const checkRoot = (mod, label) => {
    assert.strictEqual(typeof mod.RequestClient, 'function', \`\${label} RequestClient export missing\`);
    expectedRootErrorExports.forEach((key) => {
      assert.ok(mod[key], \`\${label} \${key} export missing\`);
    });
  };

  const run = async () => {
    const rootEsm = await import(paths.index.esm);
    checkRoot(rootEsm, 'Worker ESM root');
    const rootCjs = require(fileURLToPath(paths.index.cjs));
    checkRoot(rootCjs, 'Worker CJS root');

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
