import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { FetchOptions, Options, RequestOptions } from '../types/request.js';
import type { SafeWrap } from '../utils/wrap.js';

/** JSON value accepted as a request body when an endpoint has no request schema. */
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * Schema for an unknown input and an `any` output.
 * The output stays `any` so the client can return a validator result directly.
 */
// biome-ignore lint/suspicious/noExplicitAny: validator output collapses inside a generic client unless this is any
type SchemaType = StandardSchemaV1<unknown, any>;
type SchemaString = StandardSchemaV1<string, string>;
type SchemaBlob = StandardSchemaV1<Blob, Blob>;
type EmptyObject = Record<never, never>;

/** Enforce at least one property to be present on a type. */
type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>;
}[keyof T];

/**
 * EmptyishObject checks and allows for nulls on props
 */
type EmptyishObject<T> = [keyof T] extends [never] ? null : T;

/**
 * HTTPMethods that exists
 */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Allowed operations supported by the client. */
export type ClientOperation = HttpMethod | 'download' | 'url' | 'sse';

/** Events schema mapping with mapping event-type to schema */
export type SSEEventSchemas<EventName extends string = string> = Record<EventName, SchemaType>;

/** Path, query, and response schemas shared by every operation. */
type EndpointSchema = {
  $search?: SchemaType;
  $path?: SchemaType;
  response?: SchemaType;
};

/**
 * RequestDefinitions types up the possible variations of
 * the endpoints we create
 */
export type RequestDefinitions = {
  [path: string]: RequireAtLeastOne<{
    [M in ClientOperation]: M extends 'sse'
      ? EndpointSchema & { events: SSEEventSchemas }
      : M extends 'post' | 'put' | 'patch'
        ? EndpointSchema & { request?: SchemaType; response: SchemaType }
        : M extends 'download'
          ? EndpointSchema & { response?: SchemaBlob }
          : M extends 'url'
            ? EndpointSchema & { response?: SchemaString }
            : EndpointSchema & { response: SchemaType };
  }>;
};

/** Parse `{param}` segments from a path template into a typed object. */
type ParsePathParams<Path extends string | number | boolean> =
  Path extends `${infer _Start}{${infer Param}}${infer Rest}`
    ? { [K in Param]: string | number | boolean } & ParsePathParams<Rest>
    : EmptyObject;

/** Extract endpoints that support a given HTTP method. */
export type EndpointsWithMethod<Method extends ClientOperation, Schema extends RequestDefinitions> = {
  [K in keyof Schema]: Method extends keyof Schema[K] ? K : never;
}[keyof Schema];

/**
 * ResponseType defines what will be returned
 * from the endpoint
 */
type ResponseType<
  Schema,
  Endpoint extends keyof Schema,
  Method extends keyof Schema[Endpoint],
> = Schema[Endpoint][Method] extends { response: infer S extends SchemaType } ? StandardSchemaV1.InferOutput<S> : never;

/** Typed request body for an endpoint/method. Endpoints without a request schema accept JSON. */
export type RequestType<
  Schema,
  Endpoint extends keyof Schema,
  Method extends keyof Schema[Endpoint],
> = Schema[Endpoint][Method] extends { request: infer S extends SchemaType }
  ? StandardSchemaV1.InferOutput<S>
  : JsonValue;

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
  : EmptyObject;

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
  Schema extends RequestDefinitions,
  Endpoint extends keyof RequestDefinitions & string,
  Method extends ClientOperation & keyof RequestDefinitions[Endpoint],
> = EmptyishObject<
  // drop from ParsePathParams any keys that are handled by $path
  Omit<ParsePathParams<Endpoint>, PathKeys<Schema, Endpoint, Method>> &
    SearchType<Schema, Endpoint, Method> &
    PathParametersType<Schema, Endpoint, Method>
>;

/** Endpoint keys on `Schema` that define `Method`. */
export type EndpointOf<Schema extends RequestDefinitions, Method extends ClientOperation> = EndpointsWithMethod<
  Method,
  Schema
> &
  string;

/** Operations that send a request body. */
type BodyOperation = 'post' | 'put' | 'patch';

/** Options for operations that never read the GET cache. */
type WriteOptions = Omit<Options, 'cacheRequest' | 'cacheTimeToLive'>;

/**
 * Argument list for one client operation.
 * Body operations take the payload before options; the rest are `[endpoint, params, options?]`.
 */
export type CallArgs<
  Schema extends RequestDefinitions,
  Method extends Exclude<ClientOperation, 'sse'>,
  Endpoint extends EndpointOf<Schema, Method>,
> = Method extends BodyOperation
  ? [
      endpoint: Endpoint,
      params: Params<Schema, Endpoint, Method>,
      data: RequestType<Schema, Endpoint, Method>,
      options?: WriteOptions,
    ]
  : [
      endpoint: Endpoint,
      params: Params<Schema, Endpoint, Method>,
      options?: Method extends 'delete' ? WriteOptions : Method extends 'url' ? Pick<Options, 'validate'> : Options,
    ];

/** Success value returned for one client operation. */
export type CallReturn<
  Schema extends RequestDefinitions,
  Method extends Exclude<ClientOperation, 'sse'>,
  Endpoint extends EndpointOf<Schema, Method>,
> = Method extends 'download' ? Blob : Method extends 'url' ? string : ResponseType<Schema, Endpoint, Method>;

/** SSE handler. Method syntax keeps the callback bivariant for the loose parse envelope. */
type SSEHandler<T> = { handler(value: SafeWrap<Error, T>): void }['handler'];

/** SSE Options */
export type SSEOptions = Omit<FetchOptions, 'body' | 'method' | 'keepalive'> &
  Pick<RequestOptions, 'timeout' | 'validate'> & { errorUnknownType?: boolean; errorConnect?: boolean };

/**
 * Typed SSE event payload (discriminated union).
 * Narrow with `if (event.type === '...')`.
 */
export type SSEDataReturn<Schema extends RequestDefinitions, Endpoint extends EndpointOf<Schema, 'sse'>> = [
  NonNullable<Schema[Endpoint]['sse']>,
] extends [{ events: infer Events extends SSEEventSchemas }]
  ? {
      [EventName in keyof Events & string]: {
        type: EventName;
        data: StandardSchemaV1.InferOutput<Events[EventName]>;
      };
    }[keyof Events & string]
  : never;

/** Arguments for an SSE connection. The handler defaults to a loose envelope for stream parsing. */
export type SSEArgs<
  Schema extends RequestDefinitions,
  Endpoint extends EndpointOf<Schema, 'sse'>,
  HandlerReturn = { type: SSEDataReturn<Schema, Endpoint>['type']; data: SSEDataReturn<Schema, Endpoint>['data'] },
> = [
  endpoint: Endpoint,
  params: Params<Schema, Endpoint, 'sse'>,
  handler: SSEHandler<HandlerReturn>,
  options?: SSEOptions,
];

/** Function returned from `sse` requests that closes the stream. */
export type SSEReturn = () => void;
