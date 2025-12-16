// Pack-and-inspect: ensure the published tarball includes the built artifacts and metadata.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');

await fs.promises.access(distDir).catch(() => {
  throw new Error('dist/ is missing; run pnpm build before smoke:pack');
});

const tmpDir = fs.mkdtempSync(path.join(repoRoot, '.smoke-pack-'));

/**
 * @returns {void}
 */
const cleanup = () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
};

try {
  execFileSync('pnpm', ['pack', '--pack-destination', tmpDir], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const [tarball] = fs.readdirSync(tmpDir).filter((file) => file.endsWith('.tgz'));
  if (!tarball) {
    throw new Error('pnpm pack did not produce a tarball');
  }

  const tarballPath = path.join(tmpDir, tarball);
  const tarList = execFileSync('tar', ['-tf', tarballPath], { encoding: 'utf8' }).split('\n');

  const requiredEntries = [
    'package/package.json',
    'package/dist/index.mjs',
    'package/dist/index.cjs',
    'package/dist/core.mjs',
    'package/dist/core.cjs',
    'package/dist/error.mjs',
    'package/dist/error.cjs',
    'package/dist/types/index.d.mts',
    'package/dist/types/index.d.cts',
    'package/dist/types/core/index.d.mts',
    'package/dist/types/core/index.d.cts',
    'package/dist/types/error/index.d.mts',
    'package/dist/types/error/index.d.cts',
  ];

  requiredEntries.forEach((entry) => {
    assert(tarList.includes(entry), `Missing ${entry} in packed tarball ${tarballPath}`);
  });

  console.log(`Pack smoke passed: ${tarball} contains expected files.`);
} finally {
  cleanup();
}
