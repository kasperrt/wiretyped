import { CacheClient, type CacheClientOptions } from '../cache/client';
import { getHttpError, HTTPError, isAbortError, isErrorType, isTimeoutError, TimeoutError } from '../error';
import { FetchClient } from '../fetch/client';
import { mergeHeaderOptions } from '../fetch/utils';
import type {
  Config,
  FetchClientProvider,
  FetchClientProviderDefinition,
  FetchOptions,
  FetchResponse,
  Options,
  RequestOptions,
  StatusCode,
} from '../types/request';
import type { SSEClientProvider } from '../types/sse';
import { constructUrl } from '../utils/constructUrl';
import { getResponseData } from '../utils/getResponseData';
import { retry } from '../utils/retry';
import { createTimeoutSignal, mergeSignals } from '../utils/signals';
import type { Timeout } from '../utils/timeout';
import { validator } from '../utils/validator';
import { type SafeWrap, type SafeWrapAsync, safeWrap, safeWrapAsync } from '../utils/wrap';
import type {
  DeleteArgs,
  DeleteEndpoint,
  DeleteReturn,
  DownloadArgs,
  DownloadEndpoint,
  GetArgs,
  GetEndpoint,
  GetReturn,
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
} from './types';

/** Configuration for constructing a typed {@link RequestClient}. */
export interface RequestClientProps<Schema extends RequestDefinitions> {
  /** HTTP client implementation used for regular requests. Defaults to {@link FetchClient}. */
  fetchProvider?: FetchClientProvider;
  /** SSE client implementation used for server-sent events. Defaults to {@link EventSource}. */
  sseProvider?: SSEClientProvider;
  /** Base URL used when constructing request URLs (e.g. `https://api.example.com/`). */
  baseUrl: string;
  /** Absolute hostname used to build urls (e.g. `https://api.example.com`) */
  hostname: string;
  /** Optional cache configuration for GET requests. {@link CacheClientOptions} */
  cacheOpts?: CacheClientOptions;
  /** Optional fetch configuration, including request-level defaults (timeouts, retry). */
  fetchOpts?: Omit<Options, 'signal'>;
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
   * @default false
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
    this.#cacheClient = new CacheClient(cacheOpts);

    if (!sseProvider) {
      this.#log(`potentially missing event-provider polyfill, SSE handlers won't work`);
    }
    const { timeout, retry, ...fetchClientOpts } = { ...fetchOpts };
    this.#requestOpts = { timeout, retry };
    this.#endpoints = endpoints;
    this.#baseUrl = baseUrl;
    this.#hostname = hostname;
    this.#debug = debug;
    this.#validation = validation;
    this.#sseClient = sseProvider;
    this.#credentials = fetchClientOpts.credentials;
    this.#fetchClient = new fetchProvider(baseUrl, {
      ...fetchClientOpts,
      headers: mergeHeaderOptions(
        {
          Accept: 'application/json',
        },
        fetchClientOpts.headers,
      ),
    });

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
    if (fetchOpts) {
      const { timeout, retry, ...fetchClientOpts } = { ...fetchOpts };
      if (timeout !== undefined) {
        this.#requestOpts.timeout = timeout;
      }
      if (retry !== undefined) {
        this.#requestOpts.retry = retry;
      }

      this.#credentials = fetchClientOpts.credentials ?? this.#credentials;
      this.#fetchClient.config({
        ...fetchClientOpts,
        headers: mergeHeaderOptions(
          {
            Accept: 'application/json',
          },
          fetchClientOpts.headers,
        ),
      });
    }

    if (cacheOpts) {
      this.#cacheClient.config(cacheOpts);
    }
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
  async get<Endpoint extends GetEndpoint<Schema>>(
    ...args: GetArgs<Schema, Endpoint & string>
  ): SafeWrapAsync<Error, GetReturn<Schema, Endpoint>> {
    const [endpoint, params, { validate, ...opts } = {}] = args;
    const schemas = this.#endpoints[endpoint]?.get;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    this.#log(`GET OPTIONS: ${JSON.stringify(opts, null, 4)}`);

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, validate ?? this.#validation);
    if (errUrl) {
      this.#log(`GET ERRURL: ${errUrl}`);
      return [new Error('error constructing URL in get', { cause: errUrl }), null];
    }

    this.#log(`GET URL: ${url}`);

    if (opts.cacheRequest) {
      const [errCacheClient, result] = await this.#cacheClient.get(
        url,
        async () => {
          const [err, uncached] = await this.get(endpoint, params, {
            ...opts,
            cacheRequest: false,
          });

          if (err) {
            return [new Error('error getting request uncached after cache attempt', { cause: err }), null];
          }

          return [null, uncached];
        },
        opts.cacheTimeToLive,
      );

      if (errCacheClient) {
        return [
          new Error('error getting cached response in get', {
            cause: errCacheClient,
          }),
          null,
        ];
      }

      this.#log('GET CACHE: ', result);

      return [null, result];
    }

    const [errReq, result] = await this.#request<GetReturn<Schema, Endpoint>>('get', url, opts, getResponseData);
    if (errReq) {
      return [new Error('error doing request in get', { cause: errReq }), null];
    }

    if (validate === false || (this.#validation === false && !validate)) {
      return [null, result];
    }

    const [errParse, parsed] = await validator(result, schemas.response);
    if (errParse) {
      return [new Error('error parsing response in get', { cause: errParse }), null];
    }

    return [null, parsed];
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
  async post<Endpoint extends PostEndpoint<Schema>>(
    ...args: PostArgs<Schema, Endpoint & string>
  ): SafeWrapAsync<Error, PostReturn<Schema, Endpoint>> {
    const [endpoint, params, rawData, { validate, ...opts } = {}] = args;
    let data = rawData;
    const schemas = this.#endpoints[endpoint]?.post;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    this.#log(`POST OPTIONS: ${JSON.stringify(opts, null, 4)}`);

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, validate ?? this.#validation);
    if (errUrl) {
      this.#log(`POST ERRURL: ${errUrl}`);
      return [new Error('error constructing url in post', { cause: errUrl }), null];
    }

    this.#log(`POST URL: ${url}`);

    if (schemas.request && (validate === true || (this.#validation === true && validate !== false))) {
      const [errParse, parsed] = await validator(data, schemas.request);
      if (errParse) {
        return [new Error('error parsing request in post', { cause: errParse }), null];
      }

      data = parsed;
    }

    const [errReq, result] = await this.#request<PostReturn<Schema, Endpoint>>(
      'post',
      url,
      {
        ...opts,
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json', ...opts.headers },
      },
      getResponseData,
    );

    if (errReq) {
      return [new Error('error doing request in post', { cause: errReq }), null];
    }

    if (validate === false || (this.#validation === false && !validate)) {
      return [null, result];
    }

    const [errParse, parsed] = await validator(result, schemas.response);
    if (errParse) {
      return [new Error('error parsing response in post', { cause: errParse }), null];
    }

    return [null, parsed];
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
  async put<Endpoint extends PutEndpoint<Schema>>(
    ...args: PutArgs<Schema, Endpoint & string>
  ): SafeWrapAsync<Error, PutReturn<Schema, Endpoint>> {
    const [endpoint, params, rawData, { validate, ...opts } = {}] = args;
    let data = rawData;
    const schemas = this.#endpoints[endpoint]?.put;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    this.#log(`PUT OPTIONS: ${JSON.stringify(opts, null, 4)}`);

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, validate ?? this.#validation);
    if (errUrl) {
      this.#log(`PUT ERRURL: ${errUrl}`);
      return [new Error('error constructing url in put', { cause: errUrl }), null];
    }

    this.#log(`PUT URL: ${url}`);

    if (schemas.request && (validate === true || (this.#validation === true && validate !== false))) {
      const [errParse, parsed] = await validator(data, schemas.request);
      if (errParse) {
        return [new Error('error parsing request in put', { cause: errParse }), null];
      }

      data = parsed;
    }

    const [errReq, result] = await this.#request<PutReturn<Schema, Endpoint>>(
      'put',
      url,
      {
        ...opts,
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json', ...opts.headers },
      },
      getResponseData,
    );

    if (errReq) {
      return [new Error('error doing request in put', { cause: errReq }), null];
    }

    if (validate === false || (this.#validation === false && !validate)) {
      return [null, result];
    }

    const [errParse, parsed] = await validator(result, schemas.response);
    if (errParse) {
      return [new Error('error parsing response in put', { cause: errParse }), null];
    }

    return [null, parsed];
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
  async patch<Endpoint extends PatchEndpoint<Schema>>(
    ...args: PatchArgs<Schema, Endpoint & string>
  ): SafeWrapAsync<Error, PatchReturn<Schema, Endpoint>> {
    const [endpoint, params, rawData, { validate, ...opts } = {}] = args;
    let data = rawData;
    const schemas = this.#endpoints[endpoint]?.patch;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    this.#log(`PATCH OPTIONS: ${JSON.stringify(opts, null, 4)}`);

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, validate ?? this.#validation);
    if (errUrl) {
      this.#log(`PATCH ERRURL: ${errUrl}`);
      return [new Error('error constructing url in patch', { cause: errUrl }), null];
    }

    this.#log(`PATCH URL: ${url}`);

    if (schemas.request && (validate === true || (this.#validation === true && validate !== false))) {
      const [errParse, parsed] = await validator(data, schemas.request);
      if (errParse) {
        return [new Error('error parsing request in patch', { cause: errParse }), null];
      }

      data = parsed;
    }

    const [errReq, result] = await this.#request<PatchReturn<Schema, Endpoint>>(
      'patch',
      url,
      {
        ...opts,
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json', ...opts.headers },
      },
      getResponseData,
    );

    if (errReq) {
      return [new Error('error doing request in patch', { cause: errReq }), null];
    }

    if (validate === false || (this.#validation === false && !validate)) {
      return [null, result];
    }

    const [errParse, parsed] = await validator(result, schemas.response);
    if (errParse) {
      return [new Error('error parsing response in patch', { cause: errParse }), null];
    }

    return [null, parsed];
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
  async delete<Endpoint extends DeleteEndpoint<Schema>>(
    ...args: DeleteArgs<Schema, Endpoint & string>
  ): SafeWrapAsync<Error, DeleteReturn<Schema, Endpoint>> {
    const [endpoint, params, { validate, ...opts } = {}] = args;
    const schemas = this.#endpoints[endpoint]?.delete;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    this.#log(`DELETE OPTIONS: ${JSON.stringify(opts, null, 4)}`);

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, validate ?? this.#validation);
    if (errUrl) {
      this.#log(`DELETE ERRURL: ${errUrl}`);
      return [new Error('error constructing url in delete', { cause: errUrl }), null];
    }

    this.#log(`DELETE URL: ${url}`);

    const [errReq, result] = await this.#request<DeleteReturn<Schema, Endpoint>>('delete', url, opts, getResponseData);
    if (errReq) {
      return [new Error('error doing request in delete', { cause: errReq }), null];
    }

    if (validate === false || (this.#validation === false && !validate)) {
      return [null, result];
    }

    const [errParse, parsed] = await validator(result, schemas.response);
    if (errParse) {
      return [new Error('error parsing response in delete', { cause: errParse }), null];
    }

    return [null, parsed];
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
  async download<Endpoint extends DownloadEndpoint<Schema>>(
    ...args: DownloadArgs<Schema, Endpoint & string>
  ): SafeWrapAsync<Error, Blob> {
    const [endpoint, params, { validate, ...opts } = {}] = args;
    const schemas = this.#endpoints[endpoint]?.download;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    this.#log(`DOWNLOAD OPTIONS: ${JSON.stringify(opts, null, 4)}`);

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, validate ?? this.#validation);
    if (errUrl) {
      this.#log(`DOWNLOAD ERRURL: ${errUrl}`);
      return [new Error('error constructing url in download', { cause: errUrl }), null];
    }

    this.#log(`DOWNLOAD URL: ${url}`);

    const [errReq, blob] = await this.#request<Blob>('get', url, opts, (response) =>
      safeWrapAsync(() => response.blob()),
    );

    if (errReq) {
      return [new Error('error doing request in download', { cause: errReq }), null];
    }

    return [null, blob];
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
    const opts = { withCredentials: this.#credentials !== 'omit', ...options };

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
          done([new TimeoutError(`error timed out opening connection to SSE endpoint: ${url}`), null]);
        }, opts.timeout);
      }

      const [errConnection, connection] = safeWrap(() => new provider(`${this.#baseUrl}/${url}`, opts));
      if (errConnection) {
        done([new Error(`error creating new connection for SSE on ${url}`, { cause: errConnection }), null]);
        return;
      }

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
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
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
        if (isAbortError(err)) {
          return true;
        }

        if (isTimeoutError(err)) {
          return false;
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

        if (retryStatusCodes.includes(httpError.response.status) || retryIgnoreStatusCodes.length > 0) {
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

    console.debug(args);
  }
}
