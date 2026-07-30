/**
 * Structured error type shared by the security primitives.
 *
 * Every rejection carries a stable machine-readable `reason` so that callers
 * (gateway middleware, audit logs, metrics) can branch and aggregate without
 * string-matching human-facing messages. `detail` carries the small amount of
 * non-secret context useful for debugging; it must never contain key material
 * or a raw token.
 */

export type SecurityErrorReason =
  | 'jwt.malformed'
  | 'jwt.algorithm_not_allowed'
  | 'jwt.bad_signature'
  | 'jwt.expired'
  | 'jwt.not_yet_valid';

export interface SecurityErrorInit {
  readonly reason: SecurityErrorReason;
  readonly message: string;
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

export class SecurityError extends Error {
  public readonly reason: SecurityErrorReason;
  public readonly detail: Readonly<Record<string, unknown>> | undefined;

  constructor(init: SecurityErrorInit) {
    super(init.message);
    this.name = 'SecurityError';
    this.reason = init.reason;
    this.detail = init.detail;
    if (init.cause !== undefined) {
      (this as { cause?: unknown }).cause = init.cause;
    }
  }
}

/** Narrowing helper for `catch` blocks, which receive `unknown` under strict TS. */
export function isSecurityError(value: unknown): value is SecurityError {
  return value instanceof SecurityError;
}
