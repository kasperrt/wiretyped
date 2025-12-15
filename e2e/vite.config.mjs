import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const e2eRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: e2eRoot,
  base: '/',
  build: {
    outDir: `${e2eRoot}/dist`,
    emptyOutDir: true,
    rollupOptions: {
      input: `${e2eRoot}/browser-test.html`,
    },
  },
});
