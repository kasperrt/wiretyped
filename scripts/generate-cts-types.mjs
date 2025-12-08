import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Mirror the published type definitions for ESM and CommonJS consumers by adding .d.mts and .d.cts copies.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const typeEntries = ['dist/types/index.d.ts', 'dist/types/core/index.d.ts', 'dist/types/error/index.d.ts'];

for (const relativePath of typeEntries) {
  const sourcePath = resolve(repoRoot, relativePath);
  for (const extension of ['.d.cts', '.d.mts']) {
    const targetPath = sourcePath.replace(/\.d\.ts$/, extension);
    copyFileSync(sourcePath, targetPath);
  }
}
