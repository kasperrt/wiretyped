import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const e2eRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  if (mode === 'worker') {
    return {
      root: e2eRoot,
      build: {
        outDir: `${e2eRoot}/dist`,
        emptyOutDir: true,
        lib: {
          entry: `${e2eRoot}/worker-test.ts`,
          formats: ['es'],
          fileName: () => 'worker-test.mjs',
        },
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
          },
        },
      },
    };
  }

  return {
    root: e2eRoot,
    base: '/',
    build: {
      outDir: `${e2eRoot}/dist`,
      emptyOutDir: true,
      rollupOptions: {
        input: `${e2eRoot}/browser-test.html`,
      },
    },
  };
});
