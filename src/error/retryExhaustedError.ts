/**
 * Error representing a retry attempts exhausted.
 */
export class RetryExhaustedError extends Error {
  /** RetryExhaustedError error-name */
  static name = 'RetryExhaustedError';
  /** Internal attempts tried before retry was exhausted */
  #attempts: number;

  /** Creates a new instance of a RetryExhaustedError with accompanying retries attempted */
  constructor(message: string, attempts: number, opts?: ErrorOptions) {
    super(message, opts);
    this.#attempts = attempts;
  }

  /** Attempts tried before retry was suppressed */
  get attempts(): number {
    return this.#attempts;
  }
}
