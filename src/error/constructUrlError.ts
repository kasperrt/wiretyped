/**
 * Error representing a error constructing URL.
 */
export class ConstructURLError extends Error {
  /** ConstructURLError error-name */
  static name = 'ConstructURLError';
  /** Internal URL for what it looked like */
  #url: string;

  /** Creates a new instance of a ConstructURLError with accompanying URL input */
  constructor(message: string, url: string, opts?: ErrorOptions) {
    super(message, opts);
    this.#url = url;
  }

  /** Attempts tried before retry was suppressed */
  get url(): string {
    return this.#url;
  }
}

