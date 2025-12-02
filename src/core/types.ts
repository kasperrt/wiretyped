import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { FetchOptions } from '../fetch';
import type { FetchClientOptions } from '../fetch/client';
import type { FetchResponse } from '../fetch/types';
import type { SafeWrap, SafeWrapAsync } from '../utils/wrap';

// biome-ignore lint/suspicious/noExplicitAny: This is used for inferrence, and requires any so inference works as it should
type SchemaType = StandardSchemaV1<any, any>;
type SchemaString = StandardSchemaV1<string, string>;
type EmptyObject = Record<never, never>;

/** Make a subset of keys required while keeping the rest intact. */
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

/** Enforce at least one property to be present on a type. */
export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>;
}[keyof T];

/** Common request options including cache and validation controls. */
export interface HttpRequestOptions extends FetchOptions {
  cacheRequest?: boolean;
  cacheTimeToLive?: number;
  validate?: boolean;
}

/** Contract for HTTP client implementations used by RequestClient. */
export interface HttpClientProviderDefinition {
  get: (url: string, options: Omit<HttpRequestOptions, 'method' | 'body'>) => SafeWrapAsync<Error, FetchResponse>;
  put: (
    url: string,
    body: string,
    options: Omit<HttpRequestOptions, 'method' | 'body'>,
  ) => SafeWrapAsync<Error, FetchResponse>;
  patch: (
    url: string,
    body: string,
    options: Omit<HttpRequestOptions, 'method' | 'body'>,
  ) => SafeWrapAsync<Error, FetchResponse>;
  post: (
    url: string,
    body: string,
    options: Omit<HttpRequestOptions, 'method' | 'body'>,
  ) => SafeWrapAsync<Error, FetchResponse>;
  delete: (url: string, options: Omit<HttpRequestOptions, 'method' | 'body'>) => SafeWrapAsync<Error, FetchResponse>;
}

/** Factory signature for constructing HTTP providers. */
export interface HttpClientProvider {
  new (baseUrl: string, opts: FetchClientOptions): HttpClientProviderDefinition;
}

/**
 * Listener mapping for SSEClient
 */
interface SSEClientSourceEventMap {
  error: Event;
  message: MessageEvent;
  open: Event;
}

/** Init options for SSEClient */
export interface SSEClientSourceInit {
  withCredentials?: boolean;
}

/** Minimal EventSource-like contract expected by the SSE client. */
export interface SSEClientProviderDefinition {
  readonly url: string;
  readonly withCredentials: boolean;
  readonly readyState: number;
  readonly CLOSED: 2;
  readonly CONNECTING: 0;
  readonly OPEN: 1;

  onopen: ((this: SSEClientProviderDefinition, ev: Event) => void) | null;
  onmessage: ((this: SSEClientProviderDefinition, ev: MessageEvent) => void) | null;
  onerror: ((this: SSEClientProviderDefinition, ev: Event) => void) | null;

  close(): void;
  addEventListener<K extends keyof SSEClientSourceEventMap>(
    type: K,
    listener: (this: SSEClientProviderDefinition, ev: SSEClientSourceEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof SSEClientSourceEventMap>(
    type: K,
    listener: (this: SSEClientProviderDefinition, ev: SSEClientSourceEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  dispatchEvent(event: Event): boolean;
}

/** Factory signature for constructing SSE providers. */
export interface SSEClientProvider {
  new (url: string | URL, eventSourceInitDict?: SSEClientSourceInit): SSEClientProviderDefinition;
}

/**
 * EmptyishObject checks and allows for nulls on props
 */
type EmptyishObject<T> = [keyof T] extends [never] ? null : T;

/** Allowed HTTP methods supported by the client. */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'download' | 'url' | 'sse';

/**
 * RequestDefinitions types up the possible variations of
 * the endpoints we create
 */
export type RequestDefinitions = {
  [path: string]: RequireAtLeastOne<{
    [M in HttpMethod]: M extends 'url'
      ? { $search?: SchemaType; $path?: SchemaType; response: SchemaString }
      : M extends 'get' | 'delete' | 'download'
        ? { $search?: SchemaType; $path?: SchemaType; response: SchemaType }
        : {
            $search?: SchemaType;
            $path?: SchemaType;
            request?: SchemaType;
            response: SchemaType;
          };
  }>;
};

/** Parse `{param}` segments from a path template into a typed object. */
type ParsePathParams<Path extends string | number> = Path extends `${infer _Start}{${infer Param}}${infer Rest}`
  ? { [K in Param]: string | number } & ParsePathParams<Rest>
  : EmptyObject;

/** Extract endpoints that support a given HTTP method. */
export type EndpointsWithMethod<Method extends HttpMethod, Schema extends RequestDefinitions> = {
  [K in keyof Schema]: Schema[K] extends Record<Method, unknown> ? K : never;
}[keyof Schema];

/**
 * ResponseType defines what will be returned
 * from the endpoint
 */
export type ResponseType<
  Schema,
  Endpoint extends keyof Schema,
  Method extends keyof Schema[Endpoint],
> = Schema[Endpoint][Method] extends { response: infer S extends SchemaType } ? StandardSchemaV1.InferOutput<S> : never;

/** Typed request body for an endpoint/method (falls back to record for non-schematized). */
export type RequestType<
  Schema,
  Endpoint extends keyof Schema,
  Method extends keyof Schema[Endpoint],
> = Schema[Endpoint][Method] extends { request: infer S extends SchemaType }
  ? StandardSchemaV1.InferOutput<S>
  : Record<string, string>;

/** Typed query params via `$search` if present. */
type SearchType<
  Schema,
  Endpoint extends keyof Schema,
  Method extends keyof Schema[Endpoint],
> = Schema[Endpoint][Method] extends { $search: SchemaType }
  ? { $search: StandardSchemaV1.InferOutput<Schema[Endpoint][Method]['$search']> }
  : EmptyObject;

/** Typed path params via `$path` if present */
type PathParametersType<
  Schema,
  Endpoint extends keyof Schema,
  Method extends keyof Schema[Endpoint],
> = Schema[Endpoint][Method] extends { $path: infer S extends SchemaType }
  ? { $path: StandardSchemaV1.InferOutput<S> }
  : Record<never, never>;

/** Extract `$path` keys from schema for substitution. */
type PathKeys<
  Schema,
  Endpoint extends keyof Schema,
  Method extends keyof Schema[Endpoint],
> = Schema[Endpoint][Method] extends { $path: infer S extends SchemaType }
  ? keyof StandardSchemaV1.InferOutput<S>
  : never;

/** Combined params object (path + query) expected by client methods. */
export type Params<
  Endpoint extends keyof RequestDefinitions & string,
  Method extends HttpMethod & keyof RequestDefinitions[Endpoint],
  Schema extends RequestDefinitions,
> = EmptyishObject<
  // drop from ParsePathParams any keys that are handled by $path
  Omit<ParsePathParams<Endpoint>, PathKeys<Schema, Endpoint, Method>> &
    SearchType<Schema, Endpoint, Method> &
    PathParametersType<Schema, Endpoint, Method>
>;

/** Endpoint keys that expose an SSE handler. */
export type SSEEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'sse', Schema>;
/** Explicitly typed GET endpoints. */
export type GetEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'get', Schema>;
/** Explicitly typed POST endpoints. */
export type PostEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'post', Schema>;
/** Explicitly typed PUT endpoints. */
export type PutEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'put', Schema>;
/** Explicitly typed PATCH endpoints. */
export type PatchEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'patch', Schema>;
/** Explicitly typed DELETE endpoints. */
export type DeleteEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'delete', Schema>;
/** Explicitly typed DOWNLOAD endpoints. */
export type DownloadEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'download', Schema>;
/** Explicitly typed URL builder endpoints. */
export type UrlEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'url', Schema>;

/**
 * Typed parameters for get function call parameters
 */
export type SSEArgs<Endpoint extends SSEEndpoint<Schema> & string, Schema extends RequestDefinitions> = [
  endpoint: Endpoint,
  params: Params<Endpoint, 'sse', Schema>,
  handler: (data: SafeWrap<Error, SSEDataReturn<Endpoint, Schema>>) => void,
  options?: SSEClientSourceInit & { validate?: boolean; timeout?: number },
];

/**
 * Typed parameters for get function call parameters
 */
export type GetArgs<Endpoint extends GetEndpoint<Schema> & string, Schema extends RequestDefinitions> = [
  endpoint: Endpoint,
  params: Params<Endpoint, 'get', Schema>,
  options?: HttpRequestOptions,
];

/**
 * Typed parameters for post function call parameters
 */
export type PostArgs<Endpoint extends PostEndpoint<Schema> & string, Schema extends RequestDefinitions> = [
  endpoint: Endpoint,
  params: Params<Endpoint, 'post', Schema>,
  data: RequestType<Schema, Endpoint, 'post'>,
  options?: Omit<HttpRequestOptions, 'cacheRequest' | 'cacheTimeToLive'>,
];

/**
 * Typed parameters for put function call parameters
 */
export type PutArgs<Endpoint extends PutEndpoint<Schema> & string, Schema extends RequestDefinitions> = [
  endpoint: Endpoint,
  params: Params<Endpoint, 'put', Schema>,
  data: RequestType<Schema, Endpoint, 'put'>,
  options?: Omit<HttpRequestOptions, 'cacheRequest' | 'cacheTimeToLive'>,
];

/**
 * Typed parameters for patch function call parameters
 */
export type PatchArgs<Endpoint extends PatchEndpoint<Schema> & string, Schema extends RequestDefinitions> = [
  endpoint: Endpoint,
  params: Params<Endpoint, 'patch', Schema>,
  data: RequestType<Schema, Endpoint, 'patch'>,
  options?: Omit<HttpRequestOptions, 'cacheRequest' | 'cacheTimeToLive'>,
];

/**
 * Typed parameters for delete function call parameters
 */
export type DeleteArgs<Endpoint extends DeleteEndpoint<Schema> & string, Schema extends RequestDefinitions> = [
  endpoint: Endpoint,
  params: Params<Endpoint, 'delete', Schema>,
  options?: Omit<HttpRequestOptions, 'cacheRequest' | 'cacheTimeToLive'>,
];

/**
 * Typed parameters for download function call parameters
 */
export type DownloadArgs<Endpoint extends DownloadEndpoint<Schema> & string, Schema extends RequestDefinitions> = [
  endpoint: Endpoint,
  params: Params<Endpoint, 'download', Schema>,
  options?: HttpRequestOptions,
];

/**
 * Typed parameters for url function call parameters
 */
export type UrlArgs<Endpoint extends UrlEndpoint<Schema> & string, Schema extends RequestDefinitions> = [
  endpoint: Endpoint,
  params: Params<Endpoint, 'url', Schema>,
];

/** Typed return-type for get function */
export type GetReturn<T extends GetEndpoint<Schema>, Schema extends RequestDefinitions> = ResponseType<
  Schema,
  T,
  'get'
>;

/** Typed return-type for post function */
export type PostReturn<T extends PostEndpoint<Schema>, Schema extends RequestDefinitions> = ResponseType<
  Schema,
  T,
  'post'
>;

/** Typed return-type for put function */
export type PutReturn<T extends PutEndpoint<Schema>, Schema extends RequestDefinitions> = ResponseType<
  Schema,
  T,
  'put'
>;

/** Typed return-type for patch function */
export type PatchReturn<T extends PatchEndpoint<Schema>, Schema extends RequestDefinitions> = ResponseType<
  Schema,
  T,
  'patch'
>;

/** Typed return-type for delete function */
export type DeleteReturn<T extends DeleteEndpoint<Schema>, Schema extends RequestDefinitions> = ResponseType<
  Schema,
  T,
  'delete'
>;

/** Typed return-type for URL builder */
export type UrlReturn<T extends UrlEndpoint<Schema>, Schema extends RequestDefinitions> = ResponseType<
  Schema,
  T,
  'url'
>;

/**
 * Typed return-type for get function
 */
type SSEDataReturn<T extends SSEEndpoint<Schema>, Schema extends RequestDefinitions> = ResponseType<Schema, T, 'sse'>;

export type SSEReturn = () => void;
