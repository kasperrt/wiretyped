import { resolve } from 'node:path';
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { defineConfig } from 'vite';

const isProd = process.env.NODE_ENV === 'production';
const enableBundle = process.env.CODECOV_BUNDLE_ANALYSIS === 'true';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        core: resolve(__dirname, 'src/core/index.ts'),
        error: resolve(__dirname, 'src/error/index.ts'),
      },
    },
    minify: 'esbuild',
    outDir: 'dist',
    rollupOptions: {
      output: [
        {
          format: 'es',
          entryFileNames: '[name].mjs',
          chunkFileNames: 'chunks/[name]-[hash].js',
          compact: true,
        },
        {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: 'chunks/[name]-[hash].cjs',
          exports: 'named',
          compact: true,
        },
      ],
    },
    sourcemap: !isProd,
  },
  plugins: [
    codecovVitePlugin({
      enableBundleAnalysis: enableBundle,
      bundleName: 'wiretyped',
      oidc: {
        useGitHubOIDC: true,
      },
    }),
  ],
});
