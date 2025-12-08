import { copyFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Mirror the published type definitions for ESM and CommonJS consumers by adding .d.mts and .d.cts copies.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const typeRoot = resolve(repoRoot, 'dist/types');

function findTypeFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTypeFiles(entryPath));
      continue
    } 
    if (entry.isFile() && entry.name.endsWith('.d.ts')) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

const typeEntries = findTypeFiles(typeRoot);

for (const relativePath of typeEntries) {
  const sourcePath = relativePath;
  for (const extension of ['.d.cts', '.d.mts']) {
    const targetPath = sourcePath.replace(/\.d\.ts$/, extension);
    copyFileSync(sourcePath, targetPath);
  }
}
