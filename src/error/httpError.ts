import type { FetchResponse } from '../types/request.js';

/**
 * Error representing an HTTP response with a non-2xx status code.
 */
export class HTTPError extends Error {
  /** HTTPError error-name */
  static name = 'HTTPError';

  /** Response causing the HTTPError */
  #response: FetchResponse;

  /** Creates a new instance of a HTTPError with defaulting message + response to wrap */
  constructor(response: Response, message: string = `HTTP Error: ${response.status}`, opts?: ErrorOptions) {
    super(message, opts);
    this.#response = response as FetchResponse;
  }

  /**
   * Response causing the HTTPError
   */
  get response(): FetchResponse {
    return (this.#response.clone?.() as FetchResponse) ?? this.#response;
  }
}
