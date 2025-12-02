// Deno smoke: load ESM bundles and assert key exports
const distIndex = new URL('../dist/index.mjs', import.meta.url);
const distCore = new URL('../dist/core.mjs', import.meta.url);
const distError = new URL('../dist/error.mjs', import.meta.url);

const requiredErrors = [
  'AbortError',
  'TimeoutError',
  'HTTPError',
  'getHttpError',
  'isAbortError',
  'isHttpError',
  'isTimeoutError',
  'unwrapErrorType',
  'isErrorType',
];

const checkRoot = (mod: Record<string, unknown>, label: string) => {
  if (typeof mod.RequestClient !== 'function') throw new Error(`${label} RequestClient missing`);
  if (!mod.z) throw new Error(`${label} z missing`);
  for (const key of requiredErrors) {
    if (!(key in mod)) throw new Error(`${label} ${key} missing`);
  }
};

const checkCore = (mod: Record<string, unknown>, label: string) => {
  if (typeof mod.RequestClient !== 'function') throw new Error(`${label} RequestClient missing`);
  if (!mod.z) throw new Error(`${label} z missing`);
};

const checkError = (mod: Record<string, unknown>, label: string) => {
  for (const key of requiredErrors) {
    if (!(key in mod)) throw new Error(`${label} ${key} missing`);
  }
};

const root = await import(distIndex.href);
checkRoot(root, 'root');

const core = await import(distCore.href);
checkCore(core, 'core');

const error = await import(distError.href);
checkError(error, 'error');

console.log('Deno smoke passed');
