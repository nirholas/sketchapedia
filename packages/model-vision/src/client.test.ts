import { describe, expect, it, vi } from 'vitest';

import { VisionClient } from './client.js';
import {
  VisionBadRequestError,
  VisionClientError,
  VisionServerError,
  VisionTimeoutError,
} from './errors.js';
import type { GroundRequest, GroundResponse } from './types.js';

const REQ: GroundRequest = {
  keyframeUrl: 'https://cdn.example/kf.webp',
  hitmapDraft: {
    items: [
      {
        id: 'a',
        region: { kind: 'bbox', bbox: { x: 10, y: 10, w: 30, h: 30 } },
        role: 'button',
        ariaLabel: 'reserve',
      },
    ],
    viewport: { width: 1920, height: 1080 },
  },
};

const RESP: GroundResponse = {
  hitmap: {
    items: [
      {
        id: 'a',
        region: { kind: 'bbox', bbox: { x: 12, y: 11, w: 28, h: 30 } },
        role: 'button',
        ariaLabel: 'reserve',
        confidence: 0.91,
        lowConfidence: false,
      },
    ],
    viewport: { width: 1920, height: 1080 },
  },
  diagnostics: {
    meanConfidence: 0.91,
    meanIou: 0.82,
    matchRate: 1,
    escalationRate: 0,
    deadlineHit: false,
    latencyMs: 174.2,
    corrections: [{ id: 'a', iou: 0.82, confidence: 0.91, accepted: true, escalated: false }],
    keyframeHash: 'sha256:dead',
  },
};

describe('VisionClient.ground', () => {
  it('POSTs to /ground and returns parsed response', async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('http://vision:8019/ground');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string) as GroundRequest;
      expect(body.deadlineMs).toBe(500);
      return new Response(JSON.stringify(RESP), {
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = new VisionClient({ baseUrl: 'http://vision:8019/', fetch });
    const r = await client.ground(REQ);
    expect(r.diagnostics.meanIou).toBeCloseTo(0.82);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('honours call-site deadlineMs over default', async () => {
    const fetch = vi.fn(async (_: string, init: RequestInit) => {
      expect(JSON.parse(init.body as string).deadlineMs).toBe(250);
      return new Response(JSON.stringify(RESP));
    });
    await new VisionClient({ baseUrl: 'http://v:8019', fetch, defaultDeadlineMs: 800 }).ground(
      REQ,
      { deadlineMs: 250 },
    );
  });

  it('attaches Authorization header when authToken set', async () => {
    const fetch = vi.fn(async (_: string, init: RequestInit) => {
      expect(new Headers(init.headers as HeadersInit).get('authorization')).toBe('Bearer tok');
      return new Response(JSON.stringify(RESP));
    });
    await new VisionClient({
      baseUrl: 'http://v:8019',
      fetch,
      authToken: async () => 'tok',
    }).ground(REQ);
  });

  it('throws VisionBadRequestError on 400', async () => {
    const fetch = vi.fn(async () => new Response('bad', { status: 400 }));
    await expect(
      new VisionClient({ baseUrl: 'http://v:8019', fetch }).ground(REQ),
    ).rejects.toBeInstanceOf(VisionBadRequestError);
  });

  it('throws VisionServerError on 5xx with status preserved', async () => {
    const fetch = vi.fn(async () => new Response('oom', { status: 503 }));
    const err = await new VisionClient({ baseUrl: 'http://v:8019', fetch })
      .ground(REQ)
      .catch((e) => e);
    expect(err).toBeInstanceOf(VisionServerError);
    expect((err as VisionServerError).status).toBe(503);
  });

  it('throws VisionTimeoutError when AbortSignal fires', async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(
      new VisionClient({ baseUrl: 'http://v:8019', fetch }).ground(REQ, {
        signal: controller.signal,
        deadlineMs: 50,
      }),
    ).rejects.toBeInstanceOf(VisionTimeoutError);
  });

  it('requires baseUrl', () => {
    expect(() => new VisionClient({ baseUrl: '' })).toThrow(VisionClientError);
  });
});

describe('VisionClient.groundStream', () => {
  it('yields started → completed events from SSE', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        const e = new TextEncoder();
        c.enqueue(
          e.encode(
            `event: started\ndata: {"request_id":"r1"}\n\n` +
              `event: completed\ndata: ${JSON.stringify({ hitmap: RESP.hitmap, diagnostics: RESP.diagnostics })}\n\n`,
          ),
        );
        c.close();
      },
    });
    const fetch = vi.fn(
      async () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
    );
    const events = [];
    for await (const ev of new VisionClient({ baseUrl: 'http://v:8019', fetch }).groundStream(REQ))
      events.push(ev);
    expect(events.map((e) => e.type)).toEqual(['started', 'completed']);
    const c = events[1];
    if (c.type !== 'completed') throw new Error('narrowing');
    expect(c.response.diagnostics.meanIou).toBeCloseTo(0.82);
  });

  it('throws VisionServerError on error event', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('event: error\ndata: {"error":"OOM"}\n\n'));
        c.close();
      },
    });
    const fetch = vi.fn(
      async () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
    );
    const it = new VisionClient({ baseUrl: 'http://v:8019', fetch }).groundStream(REQ);
    const first = (await it.next()).value;
    expect(first?.type).toBe('error');
    await expect(it.next()).rejects.toBeInstanceOf(VisionServerError);
  });
});
