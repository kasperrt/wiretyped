import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { FetchOptions, Options, RequestOptions } from '../types/request.js';
import type { SafeWrap } from '../utils/wrap.js';

/** Schema for unknown input, any output, used to easier infer data */
// biome-ignore lint/suspicious/noExplicitAny: This is used for inferrence, and requires any so inference works as it should
export type SchemaType = StandardSchemaV1<unknown, any>;
/** Schema representing string */
export type SchemaString = StandardSchemaV1<string, string>;
/** Schema representing Blob */
export type SchemaBlob = StandardSchemaV1<unknown, Blob>;
/** Empty object definition */
export type EmptyObject = Record<never, never>;

/** Make a subset of keys required while keeping the rest intact. */
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

/** Enforce at least one property to be present on a type. */
export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>;
}[keyof T];

/**
 * EmptyishObject checks and allows for nulls on props
 */
export type EmptyishObject<T> = [keyof T] extends [never] ? null : T;

/**
 * HTTPMethods that exists
 */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Allowed operations supported by the client. */
export type ClientOperation = HttpMethod | 'download' | 'url' | 'sse';

/** Events schema mapping with mapping event-type to schema */
export type SSEEventSchemas<EventName extends string = string> = Record<EventName, SchemaType>;

/** Definition of an SSE endpoint with typed events map. */
export type SSEEndpointDefinition<Events extends SSEEventSchemas = SSEEventSchemas> = {
  $search?: SchemaType;
  $path?: SchemaType;
  events: Events;
};

/**
 * RequestDefinitions types up the possible variations of
 * the endpoints we create
 */
export type RequestDefinitions = {
  [path: string]: RequireAtLeastOne<{
    [M in ClientOperation]: M extends 'sse'
      ? SSEEndpointDefinition
      : M extends 'get' | 'delete'
        ? {
            $search?: SchemaType;
            $path?: SchemaType;
            response: SchemaType;
          }
        : M extends 'download' | 'url'
          ? {
              $search?: SchemaType;
              $path?: SchemaType;
              response?: M extends 'download' ? StandardSchemaV1<unknown, Blob> : SchemaString;
            }
          : {
              $search?: SchemaType;
              $path?: SchemaType;
              request?: SchemaType;
              response: SchemaType;
            };
  }>;
};

/** Parse `{param}` segments from a path template into a typed object. */
export type ParsePathParams<Path extends string | number | boolean> =
  Path extends `${infer _Start}{${infer Param}}${infer Rest}`
    ? { [K in Param]: string | number | boolean } & ParsePathParams<Rest>
    : EmptyObject;

/** Extract endpoints that support a given HTTP method. */
export type EndpointsWithMethod<Method extends ClientOperation, Schema extends RequestDefinitions> = {
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
  : Record<string, unknown>;

/** Typed query params via `$search` if present. */
export type SearchType<
  Schema,
  Endpoint extends keyof Schema,
  Method extends keyof Schema[Endpoint],
> = Schema[Endpoint][Method] extends { $search: SchemaType }
  ? { $search: StandardSchemaV1.InferOutput<Schema[Endpoint][Method]['$search']> }
  : EmptyObject;

/** Typed path params via `$path` if present */
export type PathParametersType<
  Schema,
  Endpoint extends keyof Schema,
  Method extends keyof Schema[Endpoint],
> = Schema[Endpoint][Method] extends { $path: infer S extends SchemaType }
  ? { $path: StandardSchemaV1.InferOutput<S> }
  : Record<never, never>;

/** Extract `$path` keys from schema for substitution. */
export type PathKeys<
  Schema,
  Endpoint extends keyof Schema,
  Method extends keyof Schema[Endpoint],
> = Schema[Endpoint][Method] extends { $path: infer S extends SchemaType }
  ? keyof StandardSchemaV1.InferOutput<S>
  : never;

/** Combined params object (path + query) expected by client methods. */
export type Params<
  Schema extends RequestDefinitions,
  Endpoint extends keyof RequestDefinitions & string,
  Method extends ClientOperation & keyof RequestDefinitions[Endpoint],
> = EmptyishObject<
  // drop from ParsePathParams any keys that are handled by $path
  Omit<ParsePathParams<Endpoint>, PathKeys<Schema, Endpoint, Method>> &
    SearchType<Schema, Endpoint, Method> &
    PathParametersType<Schema, Endpoint, Method>
>;

/** Endpoint keys that expose an SSE handler. */
export type SSEEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'sse', Schema> & string;
/** Explicitly typed GET endpoints. */
export type GetEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'get', Schema> & string;
/** Explicitly typed POST endpoints. */
export type PostEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'post', Schema> & string;
/** Explicitly typed PUT endpoints. */
export type PutEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'put', Schema> & string;
/** Explicitly typed PATCH endpoints. */
export type PatchEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'patch', Schema> & string;
/** Explicitly typed DELETE endpoints. */
export type DeleteEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'delete', Schema> & string;
/** Explicitly typed DOWNLOAD endpoints. */
export type DownloadEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'download', Schema> & string;
/** Explicitly typed URL builder endpoints. */
export type UrlEndpoint<Schema extends RequestDefinitions> = EndpointsWithMethod<'url', Schema> & string;

/**
 * Typed SSE Message envelope returning data.
 */
export type SSEMessageEnvelope<EventType extends string, Data> = {
  type: EventType;
  data: Data;
};

/** SSEHandler callback helper (for overload implementation signatures). */
export type SSEHandlerCallback<T> = { handler(value: SafeWrap<Error, T>): void }['handler'];

/** SSE Options */
export type SSEOptions = Omit<FetchOptions, 'body' | 'method' | 'keepalive'> &
  Pick<RequestOptions, 'timeout' | 'validate'> & { errorUnknownType?: boolean };

/**
 * Typed parameters for get function call parameters
 */
export type SSEArgs<
  Schema extends RequestDefinitions,
  Endpoint extends SSEEndpoint<Schema> & string,
  HandlerReturn = SSEDataReturnInferable<Schema, Endpoint>,
> = [
  endpoint: Endpoint,
  params: Params<Schema, Endpoint, 'sse'>,
  handler: SSEHandlerCallback<HandlerReturn>,
  options?: SSEOptions,
];

/**
 * Typed parameters for get function call parameters
 */
export type GetArgs<Schema extends RequestDefinitions, Endpoint extends GetEndpoint<Schema> & string> = [
  endpoint: Endpoint,
  params: Params<Schema, Endpoint, 'get'>,
  options?: Options,
];

/**
 * Typed parameters for post function call parameters
 */
export type PostArgs<Schema extends RequestDefinitions, Endpoint extends PostEndpoint<Schema> & string> = [
  endpoint: Endpoint,
  params: Params<Schema, Endpoint, 'post'>,
  data: RequestType<Schema, Endpoint, 'post'>,
  options?: Omit<Options, 'cacheRequest' | 'cacheTimeToLive'>,
];

/**
 * Typed parameters for put function call parameters
 */
export type PutArgs<Schema extends RequestDefinitions, Endpoint extends PutEndpoint<Schema> & string> = [
  endpoint: Endpoint,
  params: Params<Schema, Endpoint, 'put'>,
  data: RequestType<Schema, Endpoint, 'put'>,
  options?: Omit<Options, 'cacheRequest' | 'cacheTimeToLive'>,
];

/**
 * Typed parameters for patch function call parameters
 */
export type PatchArgs<Schema extends RequestDefinitions, Endpoint extends PatchEndpoint<Schema> & string> = [
  endpoint: Endpoint,
  params: Params<Schema, Endpoint, 'patch'>,
  data: RequestType<Schema, Endpoint, 'patch'>,
  options?: Omit<Options, 'cacheRequest' | 'cacheTimeToLive'>,
];

/**
 * Typed parameters for delete function call parameters
 */
export type DeleteArgs<Schema extends RequestDefinitions, Endpoint extends DeleteEndpoint<Schema> & string> = [
  endpoint: Endpoint,
  params: Params<Schema, Endpoint, 'delete'>,
  options?: Omit<Options, 'cacheRequest' | 'cacheTimeToLive'>,
];

/**
 * Typed parameters for download function call parameters
 */
export type DownloadArgs<Schema extends RequestDefinitions, Endpoint extends DownloadEndpoint<Schema> & string> = [
  endpoint: Endpoint,
  params: Params<Schema, Endpoint, 'download'>,
  options?: Options,
];

/**
 * Typed parameters for url function call parameters
 */
export type UrlArgs<Schema extends RequestDefinitions, Endpoint extends UrlEndpoint<Schema> & string> = [
  endpoint: Endpoint,
  params: Params<Schema, Endpoint, 'url'>,
  options?: Pick<Options, 'validate'>,
];

/** Typed return-type for get function */
export type GetReturn<Schema extends RequestDefinitions, T extends GetEndpoint<Schema>> = ResponseType<
  Schema,
  T,
  'get'
>;

/** Typed return-type for post function */
export type PostReturn<Schema extends RequestDefinitions, T extends PostEndpoint<Schema>> = ResponseType<
  Schema,
  T,
  'post'
>;

/** Typed return-type for put function */
export type PutReturn<Schema extends RequestDefinitions, T extends PutEndpoint<Schema>> = ResponseType<
  Schema,
  T,
  'put'
>;

/** Typed return-type for patch function */
export type PatchReturn<Schema extends RequestDefinitions, T extends PatchEndpoint<Schema>> = ResponseType<
  Schema,
  T,
  'patch'
>;

/** Typed return-type for delete function */
export type DeleteReturn<Schema extends RequestDefinitions, T extends DeleteEndpoint<Schema>> = ResponseType<
  Schema,
  T,
  'delete'
>;

/** Typed return-type for URL builder */
export type UrlReturn<Schema extends RequestDefinitions, T extends UrlEndpoint<Schema>> = ResponseType<
  Schema,
  T,
  'url'
>;

/** Exact typed event union for an SSE endpoint (discriminated by `type`). */
export type SSEDataReturnDefinition<Schema extends RequestDefinitions, T extends SSEEndpoint<Schema>> = [
  NonNullable<Schema[T]['sse']>,
] extends [{ events: infer Events extends SSEEventSchemas }]
  ? {
      [EventName in keyof Events & string]: SSEMessageEnvelope<
        EventName,
        StandardSchemaV1.InferOutput<Events[EventName]>
      >;
    }[keyof Events & string]
  : never;

/**
 * Typed SSE event payload (discriminated union).
 *
 * User code can narrow via `if (event.type === '...')` and get correctly narrowed `event.data`.
 */
export type SSEDataReturn<Schema extends RequestDefinitions, T extends SSEEndpoint<Schema>> = SSEDataReturnDefinition<
  Schema,
  T
>;

/**
 * Loose SSE event envelope (non-discriminated).
 *
 * Intended for internal stream parsing when the `event:` name is only known as a runtime `string`.
 */
export type SSEDataReturnInferable<
  Schema extends RequestDefinitions,
  T extends SSEEndpoint<Schema>,
> = SSEMessageEnvelope<SSEDataReturnDefinition<Schema, T>['type'], SSEDataReturnDefinition<Schema, T>['data']>;

/** Function returned from `sse` requests that closes the stream. */
export type SSEReturn = () => void;
