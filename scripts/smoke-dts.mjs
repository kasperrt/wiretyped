import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const typesRoot = path.resolve(__dirname, '../dist/types');

const walk = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(fullPath) : fullPath;
    }),
  );
  return files.flat();
};

const files = (await walk(typesRoot)).filter((file) => file.endsWith('.d.ts'));
if (files.length === 0) {
  throw new Error('No .d.ts files found under dist/types; run pnpm build:types');
}

for (const file of files) {
  const content = await fs.readFile(file, 'utf8');
  const dir = path.dirname(file);
  const base = path.basename(file, '.d.ts');

  // Ensure source maps referenced by the declaration are present
  const mapDirective = content.match(/\/\/# sourceMappingURL=(.+)$/m);
  if (mapDirective) {
    const mapPath = path.join(dir, mapDirective[1]);
    await fs.access(mapPath);
  }

  // Ensure dual declaration outputs exist (d.mts/d.cts) next to the DTS
  const mts = path.join(dir, `${base}.d.mts`);
  const cts = path.join(dir, `${base}.d.cts`);
  await fs.access(mts).catch(() => {
    throw new Error(`Missing ${mts} for ${file}`);
  });
  await fs.access(cts).catch(() => {
    throw new Error(`Missing ${cts} for ${file}`);
  });
}

console.log('Declaration smoke passed: maps and dual outputs present for dist/types.');
