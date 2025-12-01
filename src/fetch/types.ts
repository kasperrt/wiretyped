export type HeaderOptions = NonNullable<RequestInit['headers']> | Record<string, string | undefined>;

export type StatusCode =
  | 100
  | 101
  | 102
  | 103
  | 200
  | 201
  | 202
  | 203
  | 204
  | 205
  | 206
  | 207
  | 208
  | 214
  | 226
  | 300
  | 301
  | 302
  | 303
  | 304
  | 305
  | 307
  | 308
  | 400
  | 401
  | 402
  | 403
  | 404
  | 405
  | 406
  | 407
  | 408
  | 409
  | 410
  | 411
  | 412
  | 413
  | 414
  | 415
  | 416
  | 417
  | 418
  | 421
  | 422
  | 423
  | 424
  | 425
  | 426
  | 428
  | 429
  | 431
  | 451
  | 500
  | 501
  | 502
  | 503
  | 504
  | 505
  | 506
  | 507
  | 508
  | 510
  | 511;

type RetryOptions = {
  /**
   * The number of times to retry failed requests.
   * @default 2
   */
  limit?: number;
  /**
   * Time to wait before retrying
   */
  timeout?: number;
} & (
  | {
      /**
       * The HTTP status codes allowed to retry.
       * @default: [408, 429, 500, 501, 502, 503, 504]
       */
      statusCodes?: StatusCode[];
      ignoreStatusCodes?: never;
    }
  | {
      /**
       * The HTTP status codes skipping retries.
       */
      ignoreStatusCodes?: StatusCode[];
      statusCodes?: never;
    }
);

export interface FetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: HeaderOptions;
  /**
   * Request timeout in milliseconds.
   * @default 60000
   */
  timeout?: number | false;
  retry?: RetryOptions | number;
  signal?: AbortSignal;
}

export interface FetchResponse extends Response {
  status: StatusCode;
}
