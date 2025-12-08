import { resolve } from 'node:path';
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { defineConfig } from 'vite';

const isProd = process.env.NODE_ENV === 'production';
const enableBundle = process.env.CODECOV_BUNDLE_ANALYSIS === 'true';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
    },
    outDir: 'dist',
    rolldownOptions: {
      treeshake: true,
      output: [
        {
          format: 'es',
          entryFileNames: '[name].mjs',
          chunkFileNames: '[name]-[hash].mjs',
          exports: 'named',
        },
        {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name]-[hash].cjs',
          exports: 'named',
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
