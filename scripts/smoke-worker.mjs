// Worker smoke: ensure ESM bundle loads inside a worker context
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const distIndex = new URL('../dist/index.mjs', import.meta.url);
const indexPath = fileURLToPath(distIndex);

const workerSource = `
  import { parentPort } from 'node:worker_threads';
  import mod from 'file://${indexPath}';
  if (typeof mod.RequestClient !== 'function' || !mod.z) {
    parentPort.postMessage({ ok: false, error: 'RequestClient or z missing' });
  } else {
    parentPort.postMessage({ ok: true });
  }
`;

const worker = new Worker(workerSource, { eval: true });

const result = await new Promise((resolve, reject) => {
  worker.once('message', resolve);
  worker.once('error', reject);
});

if (!result?.ok) {
  throw new Error(`Worker smoke failed: ${result?.error ?? 'unknown error'}`);
}

console.log('Worker smoke passed');
