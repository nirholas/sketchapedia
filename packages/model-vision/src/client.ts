/**
 * VisionClient — the orchestrator (prompt 15) uses this to correct a draft
 * hitmap against a generated keyframe image.
 */

import {
  VisionBadRequestError,
  VisionClientError,
  VisionServerError,
  VisionTimeoutError,
} from './errors.js';
import { decodeSse } from './sse.js';
import type { GroundEvent, GroundRequest, GroundResponse } from './types.js';

export interface VisionClientOptions {
  /** Base URL of the vision service, e.g. `http://model-vision:8019`. */
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  readonly defaultDeadlineMs?: number;
  readonly authToken?: string | (() => string | Promise<string>);
  readonly headers?: Record<string, string>;
}

export interface GroundCallOptions {
  readonly signal?: AbortSignal;
  readonly deadlineMs?: number;
}

export class VisionClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultDeadlineMs: number;
  private readonly authToken: VisionClientOptions['authToken'];
  private readonly extraHeaders: Record<string, string>;

  constructor(opts: VisionClientOptions) {
    if (!opts.baseUrl) throw new VisionClientError('baseUrl is required');
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    const f = opts.fetch ?? globalThis.fetch;
    if (!f) throw new VisionClientError('no fetch implementation; pass { fetch } explicitly');
    this.fetchImpl = f.bind(globalThis);
    this.defaultDeadlineMs = opts.defaultDeadlineMs ?? 500;
    this.authToken = opts.authToken;
    this.extraHeaders = opts.headers ?? {};
  }

  async ground(req: GroundRequest, opts: GroundCallOptions = {}): Promise<GroundResponse> {
    const res = await this.doFetch('/ground', this.body(req, opts), opts);
    return res.json() as Promise<GroundResponse>;
  }

  async *groundStream(
    req: GroundRequest,
    opts: GroundCallOptions = {},
  ): AsyncGenerator<GroundEvent, void, void> {
    const res = await this.doFetch('/ground/stream', this.body(req, opts), opts, {
      Accept: 'text/event-stream',
    });
    if (!res.body) throw new VisionClientError('vision stream response has no body');
    for await (const raw of decodeSse(res.body, opts.signal)) {
      const evt = this.decode(raw);
      if (evt) yield evt;
      if (evt?.type === 'completed') return;
      if (evt?.type === 'error') throw new VisionServerError(500, evt.message);
    }
  }

  private body(req: GroundRequest, opts: GroundCallOptions): string {
    return JSON.stringify({
      ...req,
      deadlineMs: opts.deadlineMs ?? req.deadlineMs ?? this.defaultDeadlineMs,
    });
  }

  private async doFetch(
    path: string,
    body: string,
    opts: GroundCallOptions,
    extra?: Record<string, string>,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
      ...this.extraHeaders,
      ...(extra ?? {}),
    };
    const token = typeof this.authToken === 'function' ? await this.authToken() : this.authToken;
    if (token) headers.authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        body,
        headers,
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
    } catch (cause) {
      if (opts.signal?.aborted)
        throw new VisionTimeoutError(opts.deadlineMs ?? this.defaultDeadlineMs);
      throw new VisionClientError('vision /ground network failure', { cause });
    }
    if (res.ok) return res;
    const text = await res.text().catch(() => res.statusText);
    if (res.status === 400) throw new VisionBadRequestError(text);
    throw new VisionServerError(res.status, text);
  }

  private decode(raw: { event: string; data: string }): GroundEvent | null {
    if (!raw.data) return null;
    let p: unknown;
    try {
      p = JSON.parse(raw.data);
    } catch {
      return null;
    }
    switch (raw.event) {
      case 'started':
        return { type: 'started', requestId: (p as { request_id?: string }).request_id ?? '' };
      case 'loading':
        return { type: 'loading' };
      case 'completed': {
        const r = p as {
          hitmap: GroundResponse['hitmap'];
          diagnostics: GroundResponse['diagnostics'];
        };
        return { type: 'completed', response: { hitmap: r.hitmap, diagnostics: r.diagnostics } };
      }
      case 'error':
        return { type: 'error', message: (p as { error?: string }).error ?? 'unknown' };
      default:
        return null;
    }
  }
}
