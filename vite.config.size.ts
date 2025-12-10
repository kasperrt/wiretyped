import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'dist/core/client.cjs'),
      name: 'RequestClient',
      fileName: 'request-client',
      formats: ['es'],
    },
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      mangle: true,
    },
    reportCompressedSize: true,
    emptyOutDir: false,
    outDir: 'dist/size-check',
  },
});
