import { ErrorEvent, EventSource } from 'eventsource';
import { CacheClient, type CacheClientOptions } from '../cache/client';
import { TimeoutError } from '../error';
import { FetchClient } from '../fetch';
import type { FetchClientOptions } from '../fetch/client';
import { mergeHeaderOptions } from '../fetch/utils';
import { constructUrl } from '../utils/constructUrl';
import { getResponseData } from '../utils/getResponseData';
import type { Timeout } from '../utils/timeout';
import { validate } from '../utils/validate';
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
  HttpClientProvider,
  HttpClientProviderDefinition,
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
  RequestType,
  ResponseType,
  SSEArgs,
  SSEClientProvider,
  SSEEndpoint,
  SSEReturn,
  UrlArgs,
  UrlEndpoint,
  UrlReturn,
} from './types';

/** Configuration for constructing a typed {@link RequestClient}. */
export interface RequestClientProps<Schema extends RequestDefinitions> {
  /** HTTP client implementation used for regular requests. Defaults to {@link FetchClient}. */
  httpProvider?: HttpClientProvider;
  /** SSE client implementation used for server-sent events. Defaults to {@link EventSource}. */
  sseProvider?: SSEClientProvider;
  /** Base URL used when constructing request URLs (e.g. `https://api.example.com/`). */
  baseUrl: string;
  /** Absolute hostname used to build urls (e.g. `https://api.example.com`) */
  hostname: string;
  /** Optional cache configuration for GET requests. {@link CacheClientOptions} */
  cacheOpts?: CacheClientOptions;
  /** Optional fetch configuration. {@link FetchClientOptions} */
  fetchOpts?: FetchClientOptions;
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
  #httpClient: HttpClientProviderDefinition;
  #sseClient: SSEClientProvider;
  #cacheClient: CacheClient;
  #debug = false;
  #baseUrl: string;
  #hostname: string;
  #endpoints: Schema;
  #validation: boolean;
  #credentials?: RequestCredentials;

  constructor({
    httpProvider = FetchClient,
    sseProvider = EventSource,
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
      console.warn(`potentially missing event-provider polyfill, SSE handlers won't work`);
    }
    this.#endpoints = endpoints;
    this.#baseUrl = baseUrl;
    this.#hostname = hostname;
    this.#debug = debug;
    this.#validation = validation;
    this.#sseClient = sseProvider;
    this.#credentials = fetchOpts?.credentials;
    this.#httpClient = new httpProvider(baseUrl, {
      ...fetchOpts,
      headers: mergeHeaderOptions(
        {
          Accept: 'application/json',
        },
        fetchOpts?.headers,
      ),
    });

    this.#log(
      `initiated new RequestClient with ${JSON.stringify(
        {
          httpProvider,
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
    ...args: GetArgs<Endpoint & string, Schema>
  ): SafeWrapAsync<Error, GetReturn<Endpoint, Schema>> {
    const [endpoint, params, opts = {}] = args;
    const schemas = this.#endpoints[endpoint]?.get;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, opts.validate ?? this.#validation);
    this.#log(`GET OPTIONS: ${JSON.stringify(opts, null, 4)}`);
    this.#log(`GET URL: ${url}`);

    if (errUrl) {
      this.#log(`GET ERRURL: ${errUrl}`);
    }

    if (errUrl) {
      return [new Error('error constructing URL in get', { cause: errUrl }), null];
    }

    if (opts.cacheRequest) {
      const [errCacheClient, result] = await safeWrapAsync<Error, GetReturn<Endpoint, Schema>>(async () =>
        this.#cacheClient.get(
          url,
          async () => {
            // If key doesn't exist in cache, this callback will run to fetch the data with get() again,
            // with cacheRequest: false
            const [err, result] = await this.get(endpoint, params, {
              ...opts,
              cacheRequest: false,
              body: undefined,
            });
            if (err) {
              throw new Error('error getting request uncached after cache attempt', { cause: err });
            }
            return result;
          },
          opts.cacheTimeToLive,
        ),
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
    const [errReq, response] = await this.#httpClient.get(url, opts);
    if (errReq) {
      return [new Error('error doing request in get', { cause: errReq }), null];
    }

    const [errResponse, result] = await getResponseData<GetReturn<Endpoint, Schema>>(response);
    if (errResponse) {
      return [new Error('error getting response in get', { cause: errResponse }), null];
    }

    if (opts.validate === false || (this.#validation === false && !opts.validate)) {
      return [null, result];
    }

    const [errParse, parsed] = await validate(result, schemas.response);
    if (errParse) {
      return [new Error('error parsing response in get', { cause: errParse }), null];
    }

    return [null, parsed as GetReturn<Endpoint, Schema>];
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
    ...args: PostArgs<Endpoint & string, Schema>
  ): SafeWrapAsync<Error, PostReturn<Endpoint, Schema>> {
    const [endpoint, params, rawData, opts = {}] = args;
    let data = rawData;
    const schemas = this.#endpoints[endpoint]?.post;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, opts.validate ?? this.#validation);
    this.#log(`POST OPTIONS: ${JSON.stringify(opts, null, 4)}`);
    this.#log(`POST URL: ${url}`);
    this.#log(`POST DATA: ${JSON.stringify(data, null, 4)}`);

    if (errUrl) {
      this.#log(`POST ERRURL: ${errUrl}`);
    }

    if (errUrl) {
      return [new Error('error constructing url in post', { cause: errUrl }), null];
    }

    if (schemas.request && (opts.validate === true || (this.#validation === true && opts.validate !== false))) {
      const [errParse, parsed] = await validate(data, schemas.request);
      if (errParse) {
        return [new Error('error parsing request in post', { cause: errParse }), null];
      }

      data = parsed as RequestType<Schema, Endpoint & string, 'post'>;
    }

    const [errReq, response] = await this.#httpClient.post(url, JSON.stringify(data), {
      ...opts,
      headers: { ...opts.headers, 'Content-Type': 'application/json' },
    });

    if (errReq) {
      return [new Error('error doing request in post', { cause: errReq }), null];
    }

    const [errResponse, result] = await getResponseData<PostReturn<Endpoint, Schema>>(response);
    if (errResponse) {
      return [new Error('error getting response in post', { cause: errResponse }), null];
    }

    if (opts.validate === false || (this.#validation === false && !opts.validate)) {
      return [null, result];
    }

    const [errParse, parsed] = await validate(result, schemas.response);
    if (errParse) {
      return [new Error('error parsing response in post', { cause: errParse }), null];
    }

    return [null, parsed as PostReturn<Endpoint, Schema>];
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
    ...args: PutArgs<Endpoint & string, Schema>
  ): SafeWrapAsync<Error, PutReturn<Endpoint, Schema>> {
    const [endpoint, params, rawData, opts = {}] = args;
    let data = rawData;
    const schemas = this.#endpoints[endpoint]?.put;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, opts.validate ?? this.#validation);
    this.#log(`PUT OPTIONS: ${JSON.stringify(opts, null, 4)}`);
    this.#log(`PUT URL: ${url}`);
    this.#log(`PUT DATA: ${data}`);

    if (errUrl) {
      this.#log(`PUT ERRURL: ${errUrl}`);
    }

    if (errUrl) {
      return [new Error('error constructing url in put', { cause: errUrl }), null];
    }

    if (schemas.request && (opts.validate === true || (this.#validation === true && opts.validate !== false))) {
      const [errParse, parsed] = await validate(data, schemas.request);
      if (errParse) {
        return [new Error('error parsing request in put', { cause: errParse }), null];
      }

      data = parsed as RequestType<Schema, Endpoint & string, 'put'>;
    }

    const [errReq, response] = await this.#httpClient.put(url, JSON.stringify(data), {
      ...opts,
      headers: { ...opts.headers, 'Content-Type': 'application/json' },
    });
    if (errReq) {
      return [new Error('error doing request in put', { cause: errReq }), null];
    }

    const [errResponse, result] = await getResponseData<PutReturn<Endpoint, Schema>>(response);
    if (errResponse) {
      return [new Error('error getting response in put', { cause: errResponse }), null];
    }

    if (opts.validate === false || (this.#validation === false && !opts.validate)) {
      return [null, result];
    }

    const [errParse, parsed] = await validate(result, schemas.response);
    if (errParse) {
      return [new Error('error parsing response in put', { cause: errParse }), null];
    }

    return [null, parsed as PutReturn<Endpoint, Schema>];
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
    ...args: PatchArgs<Endpoint & string, Schema>
  ): SafeWrapAsync<Error, PatchReturn<Endpoint, Schema>> {
    const [endpoint, params, rawData, opts = {}] = args;
    let data = rawData;
    const schemas = this.#endpoints[endpoint]?.patch;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, opts.validate ?? this.#validation);
    this.#log(`PATCH OPTIONS: ${JSON.stringify(opts, null, 4)}`);
    this.#log(`PATCH URL: ${url}`);
    this.#log(`PATCH DATA: ${data}`);

    if (errUrl) {
      this.#log(`PATCH ERRURL: ${errUrl}`);
    }

    if (errUrl) {
      return [new Error('error constructing url in patch', { cause: errUrl }), null];
    }

    if (schemas.request && (opts.validate === true || (this.#validation === true && opts.validate !== false))) {
      const [errParse, parsed] = await validate(data, schemas.request);
      if (errParse) {
        return [new Error('error parsing request in patch', { cause: errParse }), null];
      }

      data = parsed as RequestType<Schema, Endpoint & string, 'patch'>;
    }

    const [errReq, response] = await this.#httpClient.patch(url, JSON.stringify(data), {
      ...opts,
      headers: { ...opts.headers, 'Content-Type': 'application/json' },
    });

    if (errReq) {
      return [new Error('error doing request in patch', { cause: errReq }), null];
    }

    const [errResponse, result] = await getResponseData<PatchReturn<Endpoint, Schema>>(response);
    if (errResponse) {
      return [new Error('error getting response in patch', { cause: errResponse }), null];
    }

    if (opts.validate === false || (this.#validation === false && !opts.validate)) {
      return [null, result];
    }

    const [errParse, parsed] = await validate(result, schemas.response);
    if (errParse) {
      return [new Error('error parsing response in patch', { cause: errParse }), null];
    }

    return [null, parsed as PatchReturn<Endpoint, Schema>];
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
    ...args: DeleteArgs<Endpoint & string, Schema>
  ): SafeWrapAsync<Error, DeleteReturn<Endpoint, Schema>> {
    const [endpoint, params, opts = {}] = args;
    const schemas = this.#endpoints[endpoint]?.delete;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, opts.validate ?? this.#validation);
    this.#log(`DELETE OPTIONS: ${JSON.stringify(opts, null, 4)}`);
    this.#log(`DELETE URL: ${url}`);

    if (errUrl) {
      this.#log(`DELETE ERRURL: ${errUrl}`);
    }

    if (errUrl) {
      return [new Error('error constructing url in delete', { cause: errUrl }), null];
    }

    const [errReq, response] = await this.#httpClient.delete(url, opts);

    if (errReq) {
      return [new Error('error doing request in delete', { cause: errReq }), null];
    }

    const [errResponse, result] = await getResponseData<DeleteReturn<Endpoint, Schema>>(response);
    if (errResponse) {
      return [new Error('error getting response in delete', { cause: errResponse }), null];
    }

    if (opts.validate === false || (this.#validation === false && !opts.validate)) {
      return [null, result];
    }

    const [errParse, parsed] = await validate(result, schemas.response);
    if (errParse) {
      return [new Error('error parsing response in delete', { cause: errParse }), null];
    }

    return [null, parsed as DeleteReturn<Endpoint, Schema>];
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
    ...args: DownloadArgs<Endpoint & string, Schema>
  ): SafeWrapAsync<Error, Blob> {
    const [endpoint, params, opts = {}] = args;
    const schemas = this.#endpoints[endpoint]?.download;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, opts.validate ?? this.#validation);
    this.#log(`DOWNLOAD OPTIONS: ${JSON.stringify(opts, null, 4)}`);
    this.#log(`DOWNLOAD URL: ${url}`);

    if (errUrl) {
      this.#log(`DOWNLOAD ERRURL: ${errUrl}`);
    }

    if (errUrl) {
      return [new Error('error constructing url in download', { cause: errUrl }), null];
    }

    const [errReq, response] = await this.#httpClient.get(url, opts);

    if (errReq) {
      return [new Error('error doing request in download', { cause: errReq }), null];
    }

    const [errBlob, blob] = await safeWrapAsync(() => response.blob());
    if (errBlob) {
      return [new Error('error getting blob in download', { cause: errBlob }), null];
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
    ...args: UrlArgs<Endpoint & string, Schema>
  ): SafeWrapAsync<Error, UrlReturn<Endpoint, Schema>> {
    const [endpoint, params] = args;
    const schemas = this.#endpoints[endpoint]?.url;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, this.#validation);
    this.#log(`URL: ${url}`);

    if (errUrl) {
      this.#log(`URL ERR: ${errUrl}`);
    }

    if (errUrl) {
      return [new Error('error constructing url in url', { cause: errUrl }), null];
    }

    let absoluteUrl = this.#baseUrl;
    if (!absoluteUrl.endsWith('/')) {
      absoluteUrl += '/';
    }
    absoluteUrl += url;

    this.#log(`RESULTING URL: ${absoluteUrl}`);

    if (!absoluteUrl.startsWith('http')) {
      absoluteUrl = `${this.#hostname}${absoluteUrl}`;
    }

    return [null, absoluteUrl as UrlReturn<Endpoint, Schema>];
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
    ...args: SSEArgs<Endpoint & string, Schema>
  ): SafeWrapAsync<Error, SSEReturn> {
    const [endpoint, params, handler, options] = args;
    const opts = { withCredentials: this.#credentials !== 'omit', ...options };
    this.#log(`SSE OPTIONS: ${JSON.stringify(opts, null, 4)}`);
    const schemas = this.#endpoints[endpoint]?.sse;
    if (!schemas) {
      return [new Error(`error no schemas found for ${endpoint}`), null];
    }

    const [errUrl, url] = await constructUrl(endpoint, params, schemas, opts.validate ?? this.#validation);

    if (errUrl) {
      this.#log(`SSE ERRURL: ${errUrl}`);
      return [new Error('error constructing url in sse', { cause: errUrl }), null];
    }

    this.#log(`SSE URL: ${url}`);

    const opener = new Promise<SafeWrap<Error, SSEReturn>>((resolve) => {
      const connection = new this.#sseClient(`${this.#baseUrl}/${url}`, opts);
      let resolved = false;

      let timeout: Timeout;
      if (opts.timeout) {
        // I need a test for this <--
        timeout = setTimeout(() => {
          /* v8 ignore next -- @preserve */ // This is kinda technically un-reachable, but hey, doesn't hurt being safe right?
          if (resolved) {
            return;
          }
          resolved = true;
          resolve([new TimeoutError(`error timed out opening connection to SSE endpoint: ${url}`), null]);
        }, opts.timeout);
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
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          resolve([null, close]);
          return;
        }
      };

      connection.onerror = (event: Event) => {
        // I need a test for this <--
        if (!resolved) {
          resolved = true;
          resolve([new Error(`error opening SSE connection`, { cause: event }), null]);
          return;
        }

        if (event instanceof ErrorEvent) {
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

        if (opts.validate === false || (this.#validation === false && !opts.validate)) {
          handler([null, result]);
          return;
        }

        const [errParse, parsed] = await validate(result, schemas.response);
        if (errParse) {
          handler([
            new Error('error parsing response in sse onmessage', {
              cause: errParse,
            }),
            null,
          ]);
          return;
        }

        handler([null, parsed as ResponseType<Schema, Endpoint & string, 'sse'>]);
      };
    });

    const [errOpen, close] = await opener;
    if (errOpen) {
      return [new Error('error opening SSE connection', { cause: errOpen }), null];
    }

    return [null, close];
  }

  // biome-ignore lint/suspicious/noExplicitAny: Logger
  #log(...args: any) {
    if (!this.#debug) {
      return;
    }

    console.debug(args);
  }
}
