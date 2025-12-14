---
title: Providers
---

# Providers

Defaults are `FetchClient` for HTTP. Override only if you need custom transports.

## HTTP provider shape

```ts
interface FetchClientProvider {
  new (baseUrl: string, opts: FetchClientOptions): FetchClientProviderDefinition;
}

interface FetchClientProviderDefinition {
  get(url: string, opts: Omit<FetchOptions, 'method' | 'body'>): SafeWrapAsync<Error, FetchResponse>;
  put(url: string, opts: Omit<FetchOptions, 'method'>): SafeWrapAsync<Error, FetchResponse>;
  patch(url: string, opts: Omit<FetchOptions, 'method'>): SafeWrapAsync<Error, FetchResponse>;
  post(url: string, opts: Omit<FetchOptions, 'method'>): SafeWrapAsync<Error, FetchResponse>;
  delete(url: string, opts: Omit<FetchOptions, 'method' | 'body'>): SafeWrapAsync<Error, FetchResponse>;
  config(opts: FetchClientOptions): void;
}
```

## What's next

- See frequently asked questions in [`/faq`](/faq).
