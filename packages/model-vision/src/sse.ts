/**
 * SSE decoder for the /ground/stream endpoint.
 *
 * Uses POST + AbortSignal, which the browser EventSource API doesn't support,
 * so we parse text/event-stream bodies ourselves.
 */

export interface SseEvent {
  readonly event: string;
  readonly data: string;
  readonly id?: string;
}

export async function* decodeSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, void> {
  const reader = body.getReader();
  const dec = new TextDecoder('utf-8');
  let buf = '';
  let eventType = 'message';
  let eventId: string | undefined;
  const dataLines: string[] = [];

  const onAbort = () => reader.cancel().catch(() => undefined);
  if (signal) {
    if (signal.aborted) {
      await reader.cancel();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    outer: while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const raw = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (raw === '') {
          if (dataLines.length > 0) {
            const evt: SseEvent =
              eventId !== undefined
                ? { event: eventType, data: dataLines.join('\n'), id: eventId }
                : { event: eventType, data: dataLines.join('\n') };
            yield evt;
          }
          eventType = 'message';
          eventId = undefined;
          dataLines.length = 0;
          if (signal?.aborted) break outer;
          continue;
        }
        if (raw.startsWith(':')) continue;
        const colon = raw.indexOf(':');
        const field = colon === -1 ? raw : raw.slice(0, colon);
        const val = colon === -1 ? '' : raw.slice(colon + 1).replace(/^ /, '');
        if (field === 'event') eventType = val;
        else if (field === 'data') dataLines.push(val);
        else if (field === 'id') eventId = val;
      }
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}
