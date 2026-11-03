import { resolve } from 'node:path';
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { defineConfig } from 'vite';

const isProd = process.env.NODE_ENV === 'production';
const enableBundle = process.env.CODECOV_BUNDLE_ANALYSIS === 'true';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        core: resolve(import.meta.dirname, 'src/core/index.ts'),
        error: resolve(import.meta.dirname, 'src/error/index.ts'),
      },
    },
    minify: true,
    outDir: 'dist',
    rolldownOptions: {
      treeshake: true,
      output: [
        {
          format: 'es',
          preserveModules: true,
          preserveModulesRoot: 'src',
          entryFileNames: '[name].mjs',
          chunkFileNames: '[name]-[hash].mjs',
          exports: 'named',
          // Vite leaves ESM library output pretty-printed (`codegen: false`).
          // Turn the minifier's codegen back on so the published files drop whitespace.
          minify: {
            codegen: true,
          },
          comments: false,
        },
        {
          format: 'cjs',
          preserveModules: true,
          preserveModulesRoot: 'src',
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
