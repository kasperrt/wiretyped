/**
 * Listener mapping for SSEClient
 */
export interface SSEClientSourceEventMap {
  /** Error message event mapper */
  error: Event;
  /** Message message event mapper */
  message: MessageEvent;
  /** Open message event mapper */
  open: Event;
}

/** Init options for SSEClient */
export interface SSEClientSourceInit {
  /** Whether to send cookies/credentials with the SSE connection. Here will default to what client sets, usually true */
  withCredentials?: boolean;
}

/** Minimal EventSource-like contract expected by the SSE client. */
export interface SSEClientProviderDefinition {
  /** URL the SSE client is connected to. */
  readonly url: string;
  /** Whether credentials are sent with the connection. */
  readonly withCredentials: boolean;
  /** Current ready state of the SSE connection. */
  readonly readyState: number;
  /** Closed ready state constant. */
  readonly CLOSED: 2;
  /** Connecting ready state constant. */
  readonly CONNECTING: 0;
  /** Open ready state constant. */
  readonly OPEN: 1;

  /** Callback when the connection is opened. */
  onopen: ((this: SSEClientProviderDefinition, ev: Event) => void) | null;
  /** Callback when a message event is received. */
  onmessage: ((this: SSEClientProviderDefinition, ev: MessageEvent) => void) | null;
  /** Callback when an error event occurs. */
  onerror: ((this: SSEClientProviderDefinition, ev: Event) => void) | null;

  /** Closes the SSE connection. */
  close(): void;
  /** Adds an event listener for the SSE connection. */
  addEventListener<K extends keyof SSEClientSourceEventMap>(
    type: K,
    listener: (this: SSEClientProviderDefinition, ev: SSEClientSourceEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  /** Removes an event listener from the SSE connection. */
  removeEventListener<K extends keyof SSEClientSourceEventMap>(
    type: K,
    listener: (this: SSEClientProviderDefinition, ev: SSEClientSourceEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  /** Dispatches an event to the SSE connection. */
  dispatchEvent(event: Event): boolean;
}

/** Factory signature for constructing SSE providers. */
export interface SSEClientProvider {
  /** Creates a new instance of the SSEClient through the provider */
  new (url: string | URL, eventSourceInitDict?: SSEClientSourceInit): SSEClientProviderDefinition;
}
