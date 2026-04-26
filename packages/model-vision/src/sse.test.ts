import { describe, expect, it } from 'vitest';

import { decodeSse } from './sse.js';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const x of chunks) c.enqueue(enc.encode(x));
      c.close();
    },
  });
}

describe('decodeSse', () => {
  it('parses a single named event with JSON data', async () => {
    const events = [];
    for await (const e of decodeSse(streamOf('event: completed\ndata: {"ok":true}\n\n')))
      events.push(e);
    expect(events).toEqual([{ event: 'completed', data: '{"ok":true}' }]);
  });

  it('joins multi-line data with newlines', async () => {
    const events = [];
    for await (const e of decodeSse(streamOf('event: m\ndata: l1\ndata: l2\n\n'))) events.push(e);
    expect(events[0]?.data).toBe('l1\nl2');
  });

  it('handles event boundaries spanning chunks', async () => {
    const events = [];
    for await (const e of decodeSse(
      streamOf('event: start', 'ed\ndata: 1', '\n\nevent: done\ndata: 2\n\n'),
    ))
      events.push(e);
    expect(events.map((e) => e.event)).toEqual(['started', 'done']);
    expect(events.map((e) => e.data)).toEqual(['1', '2']);
  });

  it('skips comment lines', async () => {
    const events = [];
    for await (const e of decodeSse(streamOf(': keepalive\n\nevent: x\ndata: 1\n\n')))
      events.push(e);
    expect(events).toHaveLength(1);
  });

  it('defaults event type to "message"', async () => {
    const events = [];
    for await (const e of decodeSse(streamOf('data: hi\n\n'))) events.push(e);
    expect(events[0]?.event).toBe('message');
  });

  it('cancels reader on AbortSignal', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('event: a\ndata: 1\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const ctrl = new AbortController();
    const it = decodeSse(stream, ctrl.signal);
    expect((await it.next()).value).toEqual({ event: 'a', data: '1' });
    ctrl.abort();
    const second = await it.next();
    expect(second.done).toBe(true);
    expect(cancelled).toBe(true);
  });
});
