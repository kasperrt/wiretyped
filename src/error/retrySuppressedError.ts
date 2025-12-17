/**
 * Error representing a retry attempt suppressed and exited from retrying further.
 */
export class RetrySuppressedError extends Error {
  /** RetrySuppressedError error-name */
  static name = 'RetrySuppressedError';
  /** Internal attempts tried before retry was suppressed */
  #attempts: number;

  /** Creates a new instance of a RetrySuppressedError with accompanying retries attempted */
  constructor(message: string, attempts: number, opts?: ErrorOptions) {
    super(message, opts);
    this.#attempts = attempts;
  }

  /** Attempts tried before retry was suppressed */
  get attempts(): number {
    return this.#attempts;
  }
}