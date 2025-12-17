import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(dirname, '../dist');

const cjsEntrypoints = [path.join(dist, 'index.cjs'), path.join(dist, 'error.cjs')];

const esmEntrypoints = [path.join(dist, 'index.mjs'), path.join(dist, 'error.mjs')];

try {
  for (const entry of cjsEntrypoints) {
    require(entry);
  }

  await Promise.all(esmEntrypoints.map((entry) => import(entry)));

  console.log('Runtime entrypoints loaded successfully (CJS + ESM).');
} catch (error) {
  console.error('Runtime entrypoint smoke failed:', error);
  process.exitCode = 1;
}
