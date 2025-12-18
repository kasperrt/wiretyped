import { CacheClient } from '../cache/client.js';
import { isAbortError } from '../error/abortError.js';
import { HTTPError } from '../error/httpError.js';
import { TimeoutError } from '../error/timeoutError.js';
import { unwrapErrorType } from '../error/unwrapErrorType.js';
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
import { constructUrl } from '../utils/constructUrl.js';
import { getResponseData } from '../utils/getResponseData.js';
import { retry } from '../utils/retry.js';
import { createTimeoutSignal, mergeSignals } from '../utils/signals.js';
import { sleep } from '../utils/sleep.js';
import { tryParse } from '../utils/tryParse.js';
import { validator } from '../utils/validator.js';
import { type SafeWrap, type SafeWrapAsync, safeWrapAsync } from '../utils/wrap.js';
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
  SSEDataReturn,
  SSEEndpoint,
  SSEReturn,
  UrlArgs,
  UrlEndpoint,
} from './types.js';

/** Configuration for constructing a typed {@link RequestClient}, extends {@link Config}. */
export interface RequestClientProps<Schema extends RequestDefinitions> extends Config {
  /** HTTP client implementation used for regular requests. Defaults to {@link FetchClient}. */
  fetchProvider?: FetchClientProvider;
  /** Base URL used when constructing request URLs (e.g. `https://api.example.com/`). */
  baseUrl: string;
  /** Absolute hostname used to build urls (e.g. `https://api.example.com`) */
  hostname: string;
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
  /** In-memory cache for GET requests. */
  #cacheClient: CacheClient;
  /** Default request-level options (timeout, retry). */
  #requestOpts: RequestOptions;
  /** Default HTTP status codes to retry on when unspecified. */
  #defaultRetryCodes: StatusCode[] = [408, 429, 500, 501, 502, 503, 504];
  /** Default request timeout in milliseconds. */
  #defaultTimeout = 60_000;
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
  /** Default SSE reconnect timeout (from SSE spec) */
  #defaultSSEReconnectWait = 1_000;
  /** Global abort-controller for disposing */
  #abortController: AbortController;

  /**
   * Creates a typed RequestClient that wires together the fetch provider, SSE provider, and cache.
   *
   * @param props - Configuration including base URLs, endpoint schemas, and default options.
   */
  constructor({
    fetchProvider = FetchClient,
    baseUrl,
    cacheOpts,
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
    this.#validation = validation;
    this.#credentials = fetchClientOpts.credentials;
    this.#abortController = new AbortController();
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
    this.#abortController.abort('client was disposed');
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
    ...args: GetArgs<Schema, Endpoint>
  ): SafeWrapAsync<Error, GetReturn<Schema, Endpoint>> {
    const [endpoint, params, opts = {}] = args;
    return this.#execute<'get', Endpoint, GetReturn<Schema, Endpoint>>('get', endpoint, params, opts, getResponseData);
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
    ...args: PostArgs<Schema, Endpoint>
  ): SafeWrapAsync<Error, PostReturn<Schema, Endpoint>> {
    const [endpoint, params, data, opts = {}] = args;
    return this.#execute<'post', Endpoint, PostReturn<Schema, Endpoint>>(
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
    ...args: PutArgs<Schema, Endpoint>
  ): SafeWrapAsync<Error, PutReturn<Schema, Endpoint>> {
    const [endpoint, params, data, opts = {}] = args;
    return this.#execute<'put', Endpoint, PutReturn<Schema, Endpoint>>(
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
    ...args: PatchArgs<Schema, Endpoint>
  ): SafeWrapAsync<Error, PatchReturn<Schema, Endpoint>> {
    const [endpoint, params, data, opts = {}] = args;

    return this.#execute<'patch', Endpoint, PatchReturn<Schema, Endpoint>>(
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
    ...args: DeleteArgs<Schema, Endpoint>
  ): SafeWrapAsync<Error, DeleteReturn<Schema, Endpoint>> {
    const [endpoint, params, opts = {}] = args;

    return this.#execute<'delete', Endpoint, DeleteReturn<Schema, Endpoint>>(
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
    ...args: DownloadArgs<Schema, Endpoint>
  ): SafeWrapAsync<Error, Blob> {
    const [endpoint, params, opts = {}] = args;

    return this.#execute<'download', Endpoint, Blob>('download', endpoint, params, opts, (response) =>
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
  async url<Endpoint extends UrlEndpoint<Schema>>(...args: UrlArgs<Schema, Endpoint>): SafeWrapAsync<Error, string> {
    const [endpoint, params, { validate = this.#validation } = {}] = args;
    const schemas = this.#endpoints[endpoint]?.url;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, validate);
    if (errUrl) {
      return [new Error('error constructing url in url', { cause: errUrl }), null];
    }

    let absoluteUrl = this.#baseUrl;
    if (!absoluteUrl.endsWith('/')) {
      absoluteUrl += '/';
    }
    absoluteUrl += url;

    if (!absoluteUrl.startsWith('http')) {
      absoluteUrl = `${this.#hostname}${absoluteUrl}`;
    }

    if (!validate || !schemas.response) {
      return [null, absoluteUrl];
    }

    const [errValidate, validated] = await validator(absoluteUrl, schemas.response);
    if (errValidate) {
      return [new Error('error validating result in url', { cause: errValidate }), null];
    }

    return [null, validated];
  }

  /**
   * Opens a Server-Sent Events (SSE) connection to an endpoint and wires
   * incoming messages into the provided handler as typed payloads.
   *
   * - Builds the URL from endpoint definitions and params.
   * - Optionally validates each incoming message via the endpoint `events` schema.
   *
   * The returned function can be used to close the SSE connection.
   *
   * @typeParam Endpoint - Endpoint key within {@link Schema} that supports SSE.
   * @param args - Tuple of `[endpoint, params, handler, options]`.
   * @returns A promise resolving to `[error, close]` where `close` is a function
   *          that closes the SSE stream.
   */
  async sse<Endpoint extends SSEEndpoint<Schema>>(
    ...args: SSEArgs<Schema, Endpoint, SSEDataReturn<Schema, Endpoint>>
  ): SafeWrapAsync<Error, SSEReturn> {
    const [endpoint, params, handler, opts = {}]: SSEArgs<Schema, Endpoint> = args;
    const {
      validate = this.#validation,
      timeout,
      headers,
      signal,
      errorUnknownType,
      credentials = this.#credentials,
      ...options
    } = opts;

    const schemas = this.#endpoints[endpoint].sse;
    if (!schemas?.events) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    const eventSchemas = schemas.events;
    const [errUrl, url] = await constructUrl(endpoint, params, schemas, validate);
    if (errUrl) {
      return [new Error('error constructing url in sse', { cause: errUrl }), null];
    }

    let lastEventId = '';
    let retryDelayMs = this.#defaultSSEReconnectWait;
    const controller = new AbortController();
    const isAborted = () => controller.signal.aborted || signal?.aborted === true;
    const close = (): void => controller.abort('closed by user request');
    const hasEventSchema = (name: string): name is SSEDataReturn<Schema, Endpoint & string>['type'] =>
      name in eventSchemas;

    const parseBlock = async (block: string) => {
      if (!block) {
        return;
      }

      let eventName = 'message';
      let data = '';
      let hasData = false;
      for (const line of block.split(/\r?\n/)) {
        // Safeguard, in reality should never be hit
        /* v8 ignore next -- @preserve */
        if (!line) {
          continue;
        }

        if (line.startsWith('event:')) {
          const name = line.slice(6).trim();
          if (name) {
            eventName = name;
          }

          continue;
        }
        if (line.startsWith('id:')) {
          const id = line.slice(3).trim();
          if (id) {
            lastEventId = id;
          }
          continue;
        }

        if (line.startsWith('retry:')) {
          const delay = Number(line.slice(6).trim());
          if (Number.isFinite(delay) && delay > 0) {
            retryDelayMs = delay;
          }
          continue;
        }

        if (line.startsWith('data:')) {
          const value = line.slice(5).trim();
          data += (hasData ? '\n' : '') + value;
          hasData = true;
        }
      }

      // Extra safeguard in case the above breaks in some absurd way
      if (!hasData) {
        return;
      }

      if (!hasEventSchema(eventName)) {
        if (!errorUnknownType) {
          return;
        }

        return handler([new Error(`error unknown event-type ${eventName} in sse stream`), null]);
      }

      const parsed = tryParse(data);
      if (validate === false) {
        return handler([null, { type: eventName, data: parsed }]);
      }

      const [errValidate, validated] = await validator(parsed, eventSchemas[eventName]);
      if (errValidate) {
        return handler([new Error('error validating response in sse stream', { cause: errValidate }), null]);
      }

      handler([null, { type: eventName, data: validated }]);
    };

    const open = async () => {
      const timeoutSignal = createTimeoutSignal(timeout);
      const mergedSignal = mergeSignals([signal, controller.signal, timeoutSignal, this.#abortController.signal]);

      if (mergedSignal?.aborted) {
        return controller.abort(mergedSignal.reason);
      }

      const [errWrapped, wrapped] = await safeWrapAsync(() =>
        this.#fetchClient.get(url, {
          ...options,
          headers: mergeHeaderOptions(mergeHeaderOptions(this.#defaultHeaders, headers), {
            ...(lastEventId && { 'Last-Event-ID': lastEventId }),
            Accept: 'text/event-stream',
            Connection: 'keep-alive',
          }),
          credentials,
          keepalive: true,
          ...(mergedSignal && { signal: mergedSignal }),
        }),
      );

      if (errWrapped || !wrapped) {
        return;
      }

      const [errResponse, response] = wrapped;
      if (errResponse || !response?.ok || typeof response.body?.getReader !== 'function') {
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const [errRead, chunk] = await safeWrapAsync(() => reader.read());
        if (errRead) {
          break;
        }

        const { value, done } = chunk;
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        // Safeguard, as the split above, technically can never return
        // something we cannot pop from
        /* v8 ignore next -- @preserve */
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          await parseBlock(part.trim());
        }
      }

      // Handles any blocks that wasn't "correctly" ended
      // with a newline
      await parseBlock(buffer.trim());
    };

    const listen = async () => {
      while (!isAborted()) {
        await open();
        await sleep(retryDelayMs);
      }
    };

    listen();

    return [null, close];
  }

  /**
   * Core execution pipeline for typed endpoints (except `url`/`sse`).
   *
   * - Builds the URL from schemas and validates the request payload when enabled.
   * - Handles GET caching (recursing to bypass cache on miss) before issuing the request.
   * - Invokes the underlying request executor, then parses/validates the response.
   *
   * @typeParam Method - Client operation such as `get`, `post`, or `download`.
   * @typeParam Endpoint - Endpoint key supporting the provided method.
   * @typeParam ResponseType - Parsed response shape expected from the parser.
   * @param operation - Client operation identifier (maps `download` to a GET request internally).
   * @param endpoint - Endpoint key used to resolve schemas and construct the URL.
   * @param params - Path/query params for the endpoint.
   * @param opts - Request options including caching, validation, retry, and timeout.
   * @param parser - Function converting a `FetchResponse` into typed data.
   * @param rawData - Optional request body before validation/serialization.
   * @returns A tuple `[error, result]` where `result` is the typed response.
   */
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
    const method: HttpMethod = operation === 'download' ? 'get' : operation;
    const schemas = this.#endpoints[endpoint]?.[operation];
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    let data = rawData;
    const { validate = this.#validation, cacheRequest, cacheTimeToLive, ...options } = opts;
    const [errUrl, url] = await constructUrl(endpoint, params, schemas, validate);
    if (errUrl) {
      return [new Error(`error constructing URL in ${operation}`, { cause: errUrl }), null];
    }

    if ('request' in schemas && schemas.request && validate === true) {
      const [errParse, parsed] = await validator(data, schemas.request);
      if (errParse) {
        return [new Error(`error parsing request in ${operation}`, { cause: errParse }), null];
      }

      data = parsed;
    }

    if (cacheRequest && method === 'get') {
      const cacheKey = this.#cacheClient.key(url, mergeHeaderOptions(this.#defaultHeaders, options.headers));
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

    if (validate === false || !schemas.response) {
      return [null, result];
    }

    const [errParse, parsed] = await validator(result, schemas.response);
    if (errParse) {
      return [new Error(`error parsing response in ${operation}`, { cause: errParse }), null];
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
      attempts: retryAttempts,
      timeout: retryTimeout,
      errFn: (err) => {
        if (unwrapErrorType(TimeoutError, err)) {
          return false;
        }

        if (isAbortError(err)) {
          return true;
        }

        if (unwrapErrorType(TypeError, err)) {
          return false;
        }

        const httpError = unwrapErrorType(HTTPError, err);
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
        const signal = mergeSignals([fetchOptions.signal, timeoutSignal, this.#abortController.signal]);
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
}
