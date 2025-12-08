// Conditional export resolver smoke: ensure package/self-resolution maps to the expected files.
import assert from 'node:assert';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const toFileUrl = (relative) => pathToFileURL(path.join(repoRoot, relative)).href;

const importExpectations = [
  { spec: 'wiretyped', expected: toFileUrl('dist/index.mjs') },
  { spec: 'wiretyped/package.json', expected: toFileUrl('package.json') },
];

const requireExpectations = [
  { spec: 'wiretyped', expected: path.join(repoRoot, 'dist/index.cjs') },
  { spec: 'wiretyped/package.json', expected: path.join(repoRoot, 'package.json') },
];

for (const { spec, expected } of importExpectations) {
  const resolved = await import.meta.resolve(spec, import.meta.url);
  assert.strictEqual(resolved, expected, `import.meta.resolve(${spec}) -> ${resolved}`);
}

const requireFromRoot = createRequire(path.join(repoRoot, 'package.json'));
for (const { spec, expected } of requireExpectations) {
  const resolved = requireFromRoot.resolve(spec);
  assert.strictEqual(resolved, expected, `require.resolve(${spec}) -> ${resolved}`);
}

console.log('Conditional export resolution passed (import/require for root + package.json).');
