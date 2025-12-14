import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['link', { rel: 'shortcut icon', href: '/favicon.ico' }],
  ],
  title: 'WireTyped',
  description:
    'Universal fetch-based, typed HTTP client with error-first ergonomics, retries, caching, SSE, and Standard Schema validation.',
  base: process.env.DOCS_BASE ?? '/',
  appearance: 'force-dark',
  themeConfig: {
    logo: '/logo.png',
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/entrypoints' },
      { text: 'Changelog', link: '/changelog' },
      {
        text: 'v0.3.2-alpha.0',
        items: [
          { text: 'v0.3.1', link: 'https://github.com/kasperrt/wiretyped/tree/v0.3.1' },
          { text: 'v0.3.0', link: 'https://github.com/kasperrt/wiretyped/tree/v0.3.0' },
          { text: 'v0.2.5', link: 'https://github.com/kasperrt/wiretyped/tree/v0.2.5' },
          { text: 'v0.1.2', link: 'https://github.com/kasperrt/wiretyped/tree/v0.1.2' },
          { text: 'v0.0.8', link: 'https://github.com/kasperrt/wiretyped/tree/v0.0.8' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Endpoints', link: '/guide/endpoints' },
            { text: 'Client', link: '/guide/client' },
            { text: 'Methods', link: '/guide/methods' },
          ],
        },
        {
          text: 'Features',
          items: [
            { text: 'Caching', link: '/guide/caching' },
            { text: 'Retries', link: '/guide/retries' },
            { text: 'SSE', link: '/guide/sse' },
            { text: 'Error Handling', link: '/guide/errors' },
          ],
        },
        {
          text: 'More',
          items: [{ text: 'FAQ', link: '/guide/faq' }],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Entrypoints', link: '/reference/entrypoints' },
            { text: 'Request Definitions', link: '/reference/request-definitions' },
            { text: 'Options', link: '/reference/options' },
            { text: 'Providers', link: '/reference/providers' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/kasperrt/wiretyped' }],

    editLink: {
      pattern: 'https://github.com/kasperrt/wiretyped/edit/main/docs/:path',
    },
  },
});
