import { CacheClient } from '../cache/client.js';
import { isAbortError } from '../error/abortError.js';
import { getHttpError, HTTPError } from '../error/httpError.js';
import { isErrorType } from '../error/isErrorType.js';
import { isTimeoutError, TimeoutError } from '../error/timeoutError.js';
import { FetchClient } from '../fetch/client.js';
import { mergeHeaderOptions } from '../fetch/utils.js';
import type {
  Config,
  FetchClientProvider,
  FetchClientProviderDefinition,
  FetchOptions,
  FetchResponse,
  HeaderOptions,
  RequestOptions,
  StatusCode,
} from '../types/request.js';
import type { SSEClientProvider, SSEClientProviderDefinition } from '../types/sse.js';
import { constructUrl } from '../utils/constructUrl.js';
import { getResponseData } from '../utils/getResponseData.js';
import { retry } from '../utils/retry.js';
import { createTimeoutSignal, mergeSignals } from '../utils/signals.js';
import type { Timeout } from '../utils/timeout.js';
import { validator } from '../utils/validator.js';
import { type SafeWrap, type SafeWrapAsync, safeWrap, safeWrapAsync } from '../utils/wrap.js';
import type {
  ClientOperation,
  DeleteArgs,
  DeleteEndpoint,
  DeleteReturn,
  DownloadArgs,
  DownloadEndpoint,
  EndpointsWithMethod,
  GetArgs,
  GetEndpoint,
  GetReturn,
  HttpMethod,
  Params,
  PatchArgs,
  PatchEndpoint,
  PatchReturn,
  PostArgs,
  PostEndpoint,
  PostReturn,
  PutArgs,
  PutEndpoint,
  PutReturn,
  RequestDefinitions,
  SSEArgs,
  SSEEndpoint,
  SSEReturn,
  UrlArgs,
  UrlEndpoint,
} from './types.js';

/** Configuration for constructing a typed {@link RequestClient}, extends {@link Config}. */
export interface RequestClientProps<Schema extends RequestDefinitions> extends Config {
  /** HTTP client implementation used for regular requests. Defaults to {@link FetchClient}. */
  fetchProvider?: FetchClientProvider;
  /** SSE client implementation used for server-sent events. Defaults to {@link EventSource}. */
  sseProvider?: SSEClientProvider;
  /** Base URL used when constructing request URLs (e.g. `https://api.example.com/`). */
  baseUrl: string;
  /** Absolute hostname used to build urls (e.g. `https://api.example.com`) */
  hostname: string;
  /**
   * Whether to log debug information to the console.
   * @default false
   */
  debug?: boolean;
  /**
   * Global validation flag.
   *
   * When `true`, request and response payloads are validated with the
   * configured schemas by default. Per-request options can override this.
   * @default true
   */
  validation?: boolean;
  /**
   * Map of endpoint definitions describing request/response schemas
   * and supported HTTP methods for each endpoint key.
   */
  endpoints: Schema;
}

/**
 * Typed HTTP client that:
 * - constructs URLs based on endpoint definitions,
 * - performs HTTP (and SSE) requests via a pluggable provider,
 * - optionally validates request/response payloads via schemas,
 * - optionally caches GET responses.
 *
 * All methods return error-first tuples via {@link SafeWrapAsync} or {@link SafeWrap}.
 *
 * @typeParam Schema - The map of endpoint definitions available to the client.
 */
export class RequestClient<Schema extends RequestDefinitions> {
  /** Underlying fetch-capable HTTP provider instance. */
  #fetchClient: FetchClientProviderDefinition;
  /** SSE client provider instance used for streaming endpoints. */
  #sseClient?: SSEClientProvider | null;
  /** In-memory cache for GET requests. */
  #cacheClient: CacheClient;
  /** Default request-level options (timeout, retry). */
  #requestOpts: RequestOptions;
  /** Default HTTP status codes to retry on when unspecified. */
  #defaultRetryCodes: StatusCode[] = [408, 429, 500, 501, 502, 503, 504];
  /** Default request timeout in milliseconds. */
  #defaultTimeout = 60_000;
  /** When true, emits debug logging. */
  #debug = false;
  /** Base URL prefix applied to all endpoints. */
  #baseUrl: string;
  /** Absolute hostname used to build URLs. */
  #hostname: string;
  /** Endpoint schema definitions for this client. */
  #endpoints: Schema;
  /** Global validation flag controlling request/response validation. */
  #validation: boolean;
  /** Credentials policy passed through to requests/SSE where applicable. */
  #credentials?: RequestCredentials;
  /** Default headers applied to every request (merged with per-call headers). */
  #defaultHeaders: HeaderOptions;

  /**
   * Creates a typed RequestClient that wires together the fetch provider, SSE provider, and cache.
   *
   * @param props - Configuration including base URLs, endpoint schemas, and default options.
   */
  constructor({
    fetchProvider = FetchClient,
    sseProvider = typeof EventSource !== 'undefined' ? EventSource : undefined,
    baseUrl,
    cacheOpts,
    debug = false,
    validation = true,
    fetchOpts,
    hostname,
    endpoints,
  }: RequestClientProps<Schema>) {
    const { timeout, retry, ...fetchClientOpts } = { ...fetchOpts };

    this.#cacheClient = new CacheClient(cacheOpts);
    this.#requestOpts = { timeout, retry };
    this.#endpoints = endpoints;
    this.#baseUrl = baseUrl;
    this.#hostname = hostname;
    this.#debug = debug;
    this.#validation = validation;
    this.#sseClient = sseProvider;
    this.#credentials = fetchClientOpts.credentials;
    this.#defaultHeaders = mergeHeaderOptions(
      {
        Accept: 'application/json',
      },
      fetchClientOpts.headers,
    );

    this.#fetchClient = new fetchProvider(baseUrl, {
      ...fetchClientOpts,
      headers: this.#defaultHeaders,
    });

    if (!sseProvider) {
      this.#log(`potentially missing event-provider polyfill, SSE handlers won't work`);
    }

    this.#log(
      `RequestClient: ${JSON.stringify(
        {
          fetchProvider,
          sseProvider,
          baseUrl,
          cacheOpts,
          fetchOpts,
          debug,
          validation,
        },
        null,
        4,
      )}`,
    );
  }

  /**
   * Updates request, fetch, and cache options at runtime and propagates them to underlying clients.
   */
  config(opts: Config) {
    const { cacheOpts, fetchOpts } = opts;

    if (cacheOpts) {
      this.#cacheClient.config(cacheOpts);
    }

    if (!fetchOpts) {
      return;
    }

    const { timeout, retry, ...fetchClientOpts } = { ...fetchOpts };
    if (timeout !== undefined) {
      this.#requestOpts.timeout = timeout;
    }

    if (retry !== undefined) {
      this.#requestOpts.retry = retry;
    }

    this.#credentials = fetchClientOpts.credentials ?? this.#credentials;
    this.#defaultHeaders = mergeHeaderOptions(
      {
        Accept: 'application/json',
      },
      fetchClientOpts.headers,
    );

    this.#fetchClient.config({
      ...fetchClientOpts,
      headers: this.#defaultHeaders,
    });
  }

  /**
   * Disposes resources held by this client (cache timers, pending cache entries).
   * Invoke when tearing down short-lived clients to avoid leaking intervals.
   */
  dispose() {
    this.#cacheClient.dispose();
    this.#fetchClient.dispose?.();
  }

  /**
   * Performs a typed GET request against a configured endpoint.
   *
   * - Builds the URL from endpoint definitions and params.
   * - Optionally returns cached data when `cacheRequest` is enabled.
   * - Optionally validates the response via the endpoint `response` schema.
   *
   * @typeParam Endpoint - Endpoint key within {@link Schema} that supports GET.
   * @param args - Tuple of `[endpoint, params, options]`.
   * @returns A promise resolving to `[error, data]` where `data` is the typed response.
   */
  get<Endpoint extends GetEndpoint<Schema>>(
    ...args: GetArgs<Schema, Endpoint & string>
  ): SafeWrapAsync<Error, GetReturn<Schema, Endpoint>> {
    const [endpoint, params, opts = {}] = args;
    return this.#execute<'get', Endpoint & string, GetReturn<Schema, Endpoint>>(
      'get',
      endpoint,
      params,
      opts,
      getResponseData,
    );
  }

  /**
   * Performs a typed POST request against a configured endpoint.
   *
   * - Builds the URL from endpoint definitions and params.
   * - Optionally validates the request body using the endpoint `request` schema.
   * - Optionally validates the response using the endpoint `response` schema.
   *
   * @typeParam Endpoint - Endpoint key within {@link Schema} that supports POST.
   * @param args - Tuple of `[endpoint, params, body, options]`.
   * @returns A promise resolving to `[error, data]` where `data` is the typed response.
   */
  post<Endpoint extends PostEndpoint<Schema>>(
    ...args: PostArgs<Schema, Endpoint & string>
  ): SafeWrapAsync<Error, PostReturn<Schema, Endpoint>> {
    const [endpoint, params, data, opts = {}] = args;
    return this.#execute<'post', Endpoint & string, PostReturn<Schema, Endpoint>>(
      'post',
      endpoint,
      params,
      { ...opts, cacheRequest: false },
      getResponseData,
      data,
    );
  }

  /**
   * Performs a typed PUT request against a configured endpoint.
   *
   * - Builds the URL from endpoint definitions and params.
   * - Optionally validates the request body using the endpoint `request` schema.
   * - Optionally validates the response using the endpoint `response` schema.
   *
   * @typeParam Endpoint - Endpoint key within {@link Schema} that supports PUT.
   * @param args - Tuple of `[endpoint, params, body, options]`.
   * @returns A promise resolving to `[error, data]` where `data` is the typed response.
   */
  put<Endpoint extends PutEndpoint<Schema>>(
    ...args: PutArgs<Schema, Endpoint & string>
  ): SafeWrapAsync<Error, PutReturn<Schema, Endpoint>> {
    const [endpoint, params, data, opts = {}] = args;
    return this.#execute<'put', Endpoint & string, PutReturn<Schema, Endpoint>>(
      'put',
      endpoint,
      params,
      { ...opts, cacheRequest: false },
      getResponseData,
      data,
    );
  }

  /**
   * Performs a typed PATCH request against a configured endpoint.
   *
   * - Builds the URL from endpoint definitions and params.
   * - Optionally validates the request body using the endpoint `request` schema.
   * - Optionally validates the response using the endpoint `response` schema.
   *
   * @typeParam Endpoint - Endpoint key within {@link Schema} that supports PATCH.
   * @param args - Tuple of `[endpoint, params, body, options]`.
   * @returns A promise resolving to `[error, data]` where `data` is the typed response.
   */
  patch<Endpoint extends PatchEndpoint<Schema>>(
    ...args: PatchArgs<Schema, Endpoint & string>
  ): SafeWrapAsync<Error, PatchReturn<Schema, Endpoint>> {
    const [endpoint, params, data, opts = {}] = args;

    return this.#execute<'patch', Endpoint & string, PatchReturn<Schema, Endpoint>>(
      'patch',
      endpoint,
      params,
      { ...opts, cacheRequest: false },
      getResponseData,
      data,
    );
  }

  /**
   * Performs a typed DELETE request against a configured endpoint.
   *
   * - Builds the URL from endpoint definitions and params.
   * - Optionally validates the response using the endpoint `response` schema.
   *
   * @typeParam Endpoint - Endpoint key within {@link Schema} that supports DELETE.
   * @param args - Tuple of `[endpoint, params, options]`.
   * @returns A promise resolving to `[error, data]` where `data` is the typed response.
   */
  delete<Endpoint extends DeleteEndpoint<Schema>>(
    ...args: DeleteArgs<Schema, Endpoint & string>
  ): SafeWrapAsync<Error, DeleteReturn<Schema, Endpoint>> {
    const [endpoint, params, opts = {}] = args;

    return this.#execute<'delete', Endpoint & string, DeleteReturn<Schema, Endpoint>>(
      'delete',
      endpoint,
      params,
      opts,
      getResponseData,
    );
  }

  /**
   * Performs a binary download against a configured endpoint using GET.
   *
   * - Builds the URL from endpoint definitions and params.
   * - Returns the response as a `Blob` without schema validation.
   *
   * @typeParam Endpoint - Endpoint key within {@link Schema} that supports `download`.
   * @param args - Tuple of `[endpoint, params, options]`.
   * @returns A promise resolving to `[error, blob]`.
   */
  download<Endpoint extends DownloadEndpoint<Schema>>(
    ...args: DownloadArgs<Schema, Endpoint & string>
  ): SafeWrapAsync<Error, Blob> {
    const [endpoint, params, opts = {}] = args;

    return this.#execute<'download', Endpoint & string, Blob>('download', endpoint, params, opts, (response) =>
      safeWrapAsync(() => response.blob()),
    );
  }

  /**
   * Returns a fully qualified URL for an endpoint without performing any request.
   *
   * - Builds the relative URL using the endpoint definition and params.
   * - Resolves it against `baseUrl` and `hostname` to ensure it is absolute.
   *
   * @typeParam Endpoint - Endpoint key within {@link Schema} that supports `url`.
   * @param args - Tuple of `[endpoint, params]`.
   * @returns A tuple `[error, url]` where `url` is the resolved absolute URL.
   */
  async url<Endpoint extends UrlEndpoint<Schema>>(
    ...args: UrlArgs<Schema, Endpoint & string>
  ): SafeWrapAsync<Error, string> {
    const [endpoint, params, { validate } = {}] = args;
    const schemas = this.#endpoints[endpoint]?.url;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, validate ?? this.#validation);
    if (errUrl) {
      this.#log(`URL ERR: ${errUrl}`);
      return [new Error('error constructing url in url', { cause: errUrl }), null];
    }

    this.#log(`URL: ${url}`);

    let absoluteUrl = this.#baseUrl;
    if (!absoluteUrl.endsWith('/')) {
      absoluteUrl += '/';
    }
    absoluteUrl += url;

    this.#log(`RESULTING URL: ${absoluteUrl}`);

    if (!absoluteUrl.startsWith('http')) {
      absoluteUrl = `${this.#hostname}${absoluteUrl}`;
    }

    return [null, absoluteUrl];
  }

  /**
   * Opens a Server-Sent Events (SSE) connection to an endpoint and wires
   * incoming messages into the provided handler as typed payloads.
   *
   * - Builds the URL from endpoint definitions and params.
   * - Uses the configured `sseProvider` (defaults to `EventSource`).
   * - Optionally validates each incoming message via the endpoint `response` schema.
   *
   * The returned function can be used to close the SSE connection.
   *
   * @typeParam Endpoint - Endpoint key within {@link Schema} that supports SSE.
   * @param args - Tuple of `[endpoint, params, handler, options]`.
   * @returns A promise resolving to `[error, close]` where `close` is a function
   *          that closes the SSE stream.
   */
  async sse<Endpoint extends SSEEndpoint<Schema>>(
    ...args: SSEArgs<Schema, Endpoint & string>
  ): SafeWrapAsync<Error, SSEReturn> {
    const [endpoint, params, handler, { validate, ...options } = {}] = args;
    const opts = { withCredentials: options?.withCredentials ?? this.#credentials === 'include', ...options };

    this.#log(`SSE OPTIONS: ${JSON.stringify(opts, null, 4)}`);

    const schemas = this.#endpoints[endpoint]?.sse;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, validate ?? this.#validation);
    if (errUrl) {
      this.#log(`SSE ERRURL: ${errUrl}`);
      return [new Error('error constructing url in sse', { cause: errUrl }), null];
    }

    const provider = this.#sseClient;
    if (!provider) {
      return [new Error(`error missing sse provider in sse on url ${url}`), null];
    }

    const opener = new Promise<SafeWrap<Error, SSEReturn>>((resolve) => {
      let resolved = false;
      let timeoutId: Timeout;
      let connection: SSEClientProviderDefinition | null = null;

      const closeConnection = () => {
        if (!connection || connection.readyState === connection.CLOSED) {
          return;
        }

        connection.close();
      };

      const done = (res: SafeWrap<Error, VoidFunction>) => {
        if (resolved) {
          return;
        }

        clearTimeout(timeoutId);
        resolved = true;
        resolve(res);
      };

      if (opts.timeout) {
        timeoutId = setTimeout(() => {
          closeConnection();
          done([new TimeoutError(`error timed out opening connection to SSE endpoint: ${url}`), null]);
        }, opts.timeout);
      }

      const [errConnection, createdConnection] = safeWrap(() => new provider(`${this.#baseUrl}/${url}`, opts));
      if (errConnection || !createdConnection) {
        done([new Error(`error creating new connection for SSE on ${url}`, { cause: errConnection }), null]);
        return;
      }

      connection = createdConnection;

      const close = (): void => {
        this.#log(`SSE CLOSE: ${url}`);

        if (connection.readyState === connection.CLOSED) {
          this.#log(`SSE TRIED CLOSING CLOSED STREAM: ${url}`);
          return;
        }

        connection.close();
      };

      connection.onopen = () => {
        done([null, close]);
      };

      connection.onerror = (event: Event) => {
        if (!resolved) {
          closeConnection();
          done([new Error(`error opening SSE connection`, { cause: event }), null]);
          return;
        }

        if ('name' in event && 'message' in event && event.name === 'ErrorEvent') {
          handler([
            new Error(`error receiving on ${url} for sse: ${event.message}`, {
              cause: event,
            }),
            null,
          ]);
          return;
        }

        handler([new Error(`error generic error on ${url} for sse`), null]);
      };

      connection.onmessage = async (e: MessageEvent) => {
        const [err, result] = safeWrap(() => JSON.parse(e.data));
        if (err) {
          handler([new Error('error parsing JSON in sse onmessage', { cause: err }), null]);
          return;
        }

        if (validate === false || (this.#validation === false && !validate)) {
          handler([null, result]);
          return;
        }

        const [errParse, parsed] = await validator(result, schemas.response);
        if (errParse) {
          handler([
            new Error('error parsing response in sse onmessage', {
              cause: errParse,
            }),
            null,
          ]);
          return;
        }

        handler([null, parsed]);
      };
    });

    this.#log(`SSE URL: ${url}`);
    const [errOpen, close] = await opener;
    if (errOpen) {
      return [new Error('error opening SSE connection', { cause: errOpen }), null];
    }

    return [null, close];
  }

  async #execute<
    Method extends Exclude<ClientOperation, 'url' | 'sse'>,
    Endpoint extends EndpointsWithMethod<Method, Schema> & string,
    ResponseType,
  >(
    operation: Method,
    endpoint: Endpoint,
    params: Params<Schema, Endpoint, Method>,
    opts: FetchOptions & RequestOptions,
    parser: (response: FetchResponse) => SafeWrapAsync<Error, ResponseType>,
    rawData?: unknown,
  ): SafeWrapAsync<Error, ResponseType> {
    const op = operation.toUpperCase();
    const method: HttpMethod = operation === 'download' ? 'get' : operation;
    const schemas = this.#endpoints[endpoint]?.[operation];
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    this.#log(`${op} OPTIONS: ${JSON.stringify(opts, null, 4)}`);

    let data = rawData;
    const { validate, cacheRequest, cacheTimeToLive, ...options } = opts ?? {};
    const [errUrl, url] = await constructUrl(endpoint, params, schemas, validate ?? this.#validation);
    if (errUrl) {
      this.#log(`${op} ERRURL: ${errUrl}`);
      return [new Error('error constructing URL in get', { cause: errUrl }), null];
    }

    this.#log(`${op} URL: ${url}`);

    if (
      'request' in schemas &&
      schemas.request &&
      (validate === true || (this.#validation === true && validate !== false))
    ) {
      const [errParse, parsed] = await validator(data, schemas.request);
      if (errParse) {
        return [new Error('error parsing request in patch', { cause: errParse }), null];
      }

      data = parsed;
    }

    if (cacheRequest && method === 'get') {
      const cacheKey = await this.#cacheClient.key(url, mergeHeaderOptions(this.#defaultHeaders, options.headers));
      const [errCacheClient, result] = await this.#cacheClient.get<ResponseType>(
        cacheKey,
        async () => {
          const [err, uncached] = await this.#execute(
            operation,
            endpoint,
            params,
            {
              ...options,
              cacheRequest: false,
            },
            parser,
            data,
          );

          if (err) {
            return [new Error('error getting request uncached after cache attempt', { cause: err }), null];
          }

          return [null, uncached];
        },
        cacheTimeToLive,
      );

      if (errCacheClient) {
        return [
          new Error(`error getting cached response in ${operation}`, {
            cause: errCacheClient,
          }),
          null,
        ];
      }

      this.#log(`${op} CACHE: `, result);

      return [null, result];
    }

    const requestOptions: FetchOptions & Pick<RequestOptions, 'retry' | 'timeout'> = { ...options };

    // If we have data to send, stringify, and set the appropriate header
    if (data) {
      requestOptions.body = JSON.stringify(data);
      requestOptions.headers = mergeHeaderOptions(
        new Headers({ 'Content-Type': 'application/json' }),
        requestOptions.headers,
      );
    }

    const [errReq, result] = await this.#request<ResponseType>(method, url, requestOptions, parser);
    if (errReq) {
      return [new Error(`error doing request in ${operation}`, { cause: errReq }), null];
    }

    if (operation === 'download' || validate === false || (this.#validation === false && !validate)) {
      return [null, result];
    }

    const [errParse, parsed] = await validator(result, schemas.response);
    if (errParse) {
      return [new Error('error parsing response in get', { cause: errParse }), null];
    }

    return [null, parsed];
  }

  /**
   * Internal request executor that applies retry/timeout handling and response parsing.
   *
   * - Normalizes retry/timeout options and merges abort signals.
   * - Calls the underlying HTTP provider and wraps thrown errors.
   * - Converts provider error tuples into wrapped `Error`s with the method context.
   * - Validates HTTP status and parses the response via the provided parser.
   *
   * @template ResponseType - The parsed response type expected from the parser.
   * @param method - HTTP method to invoke on the provider.
   * @param url - Fully constructed request URL.
   * @param opts - Request options (fetch options + retry/timeout/cache flags).
   * @param parser - Function that turns a `FetchResponse` into typed data.
   * @returns A tuple of `[error, result]`.
   */
  #request<ResponseType>(
    method: HttpMethod,
    url: string,
    opts: FetchOptions & Pick<RequestOptions, 'retry' | 'timeout'>,
    parser: (response: FetchResponse) => SafeWrapAsync<Error, ResponseType>,
  ): SafeWrapAsync<Error, ResponseType> {
    const { retry: retryOpt, timeout: timeoutOpt, ...fetchOptions } = opts;
    const retryOptions = retryOpt ?? this.#requestOpts.retry ?? { limit: 2 };
    const simpleRetry = typeof retryOptions === 'number';
    const timeout = timeoutOpt ?? this.#requestOpts.timeout ?? this.#defaultTimeout;

    let retryAttempts = 2;
    let retryTimeout = 1000;
    let retryIgnoreStatusCodes: StatusCode[] = [];
    let retryStatusCodes: StatusCode[] = this.#defaultRetryCodes;

    if (simpleRetry) {
      retryAttempts = retryOptions;
    }

    if (!simpleRetry) {
      if (retryOptions.timeout) {
        retryTimeout = retryOptions.timeout;
      }

      if (typeof retryOptions.limit === 'number') {
        retryAttempts = retryOptions.limit;
      }

      if (retryOptions.ignoreStatusCodes) {
        retryIgnoreStatusCodes = retryOptions.ignoreStatusCodes;
      }

      if (retryOptions.statusCodes) {
        retryStatusCodes = retryOptions.statusCodes;
      }
    }

    return retry<ResponseType>({
      name: 'requestRetrier',
      attempts: retryAttempts,
      timeout: retryTimeout,
      log: this.#debug,
      errFn: (err) => {
        if (isTimeoutError(err)) {
          return false;
        }

        if (isAbortError(err)) {
          return true;
        }

        if (isErrorType(TypeError, err)) {
          return false;
        }

        const httpError = getHttpError(err);
        if (!httpError) {
          return false;
        }

        if (retryIgnoreStatusCodes.includes(httpError.response.status)) {
          return true;
        }

        if (retryStatusCodes.includes(httpError.response.status)) {
          return false;
        }

        return true;
      },
      fn: async () => {
        const timeoutSignal = createTimeoutSignal(timeout);
        const signal = mergeSignals([fetchOptions.signal, timeoutSignal]);
        const requestOptions = { ...fetchOptions, ...(signal && { signal }) };
        const [errWrapped, wrapped] = await safeWrapAsync(() => this.#fetchClient[method](url, requestOptions));
        if (errWrapped) {
          return [new Error(`error calling request ${method.toUpperCase()} in request`, { cause: errWrapped }), null];
        }

        const [err, response] = wrapped;
        if (err) {
          return [new Error(`error request ${method.toUpperCase()} in request`, { cause: err }), null];
        }

        if (!response.ok) {
          return [new HTTPError(response, `error in ${method.toUpperCase()} request`), null];
        }

        const [errResponse, result] = await parser(response);
        if (errResponse) {
          return [new Error(`error getting response in ${method.toUpperCase()}`, { cause: errResponse }), null];
        }

        return [null, result];
      },
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: Logger
  #log(...args: any) {
    if (!this.#debug) {
      return;
    }

    console.debug(...args);
  }
}
