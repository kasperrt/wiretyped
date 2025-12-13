---
title: Server-Sent Events (SSE)
outline: deep
---

# Server-Sent Events (SSE)

WireTyped supports typed SSE streams via `client.sse(endpoint, params, handler, options)`.

- It uses `fetch` under the hood (no `EventSource`, no extra dependencies), so it works anywhere `fetch` + streams are available.
- The client builds URLs with path/query validation just like HTTP requests.
- Messages are parsed as JSON and validated against the typed event schema by default; set `validate: false` per-call to skip.
- Unknown event names are ignored unless you pass `errorUnknownType: true`, which forwards an error to the handler.
- The handler is error-first: it receives either `[err, null]` or `[null, { type, data }]` (the latter allows type narrowing).
- Reconnect delay follows the SSE spec’s `retry:` field (or the client default of `1000ms` if none is sent).
- When the stream sends an `id:` field, WireTyped stores it and sends it back as the `Last-Event-ID` header on reconnect (SSE spec).

## Type narrowing example

Define structured events:

```ts
import { z } from 'zod';
// Or your standard-schema/spec of choice
import type { RequestDefinitions } from 'wiretyped';

const endpoints = {
  '/events': {
    sse: {
      events: {
        message: z.object({ msg: z.string(), userId: z.string() }),
        progress: z.object({ percent: z.number().min(0).max(100) }),
        status: z.enum(['starting', 'ready', 'stopping']),
      },
    },
  },
} satisfies RequestDefinitions;
```

Handle events with type narrowing:

```ts
const [err, close] = await client.sse('/events', null, ([errEvent, event]) => {
  if (errEvent) {
    return console.error(errEvent);
  }

  switch (event.type) {
    case 'message':
      event.data.msg; // string
      event.data.userId; // string
      break;
    case 'progress':
      event.data.percent; // number (0..100)
      break;
    case 'status':
      event.data; // 'starting' | 'ready' | 'stopping'
      break;
  }
});

if (err) {
  return err;
}
close();
```

## Notes

- `timeout` is implemented via an abort signal; when it triggers, the stream stops (no reconnects).
- Pass `signal` to stop the stream and prevent reconnects.

See [`/guide/methods#sse`](/guide/methods#sse) for a minimal example.

## What's next

- Learn retry/timeouts behavior (including abort behavior) in [`/guide/retries`](/guide/retries).
- Learn error unwrapping utilities in [`/guide/errors`](/guide/errors).
