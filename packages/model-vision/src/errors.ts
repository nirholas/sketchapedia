/** Structured error classes emitted by the vision client. */

export class VisionClientError extends Error {
  public readonly status: number | undefined;
  public readonly detail: string | undefined;

  constructor(message: string, opts?: { status?: number; detail?: string; cause?: unknown }) {
    super(message);
    this.name = 'VisionClientError';
    this.status = opts?.status;
    this.detail = opts?.detail;
    if (opts?.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}

export class VisionBadRequestError extends VisionClientError {
  constructor(detail: string) {
    super(`vision /ground rejected input: ${detail}`, { status: 400, detail });
    this.name = 'VisionBadRequestError';
  }
}

export class VisionServerError extends VisionClientError {
  constructor(status: number, detail: string) {
    super(`vision /ground failed: ${status} ${detail}`, { status, detail });
    this.name = 'VisionServerError';
  }
}

export class VisionTimeoutError extends VisionClientError {
  constructor(deadlineMs: number) {
    super(`vision /ground timed out after ${deadlineMs}ms`, { detail: 'timeout' });
    this.name = 'VisionTimeoutError';
  }
}
