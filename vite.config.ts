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
          preserveModules: true,
          preserveModulesRoot: 'src',
          entryFileNames: '[name].mjs',
          chunkFileNames: '[name]-[hash].mjs',
          exports: 'named',
          minify: true,
        },
        {
          format: 'cjs',
          preserveModules: true,
          preserveModulesRoot: 'src',
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name]-[hash].cjs',
          exports: 'named',
          minify: true,
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
