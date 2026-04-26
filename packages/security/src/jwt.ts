import { SecurityError } from './errors.js';

/**
 * Minimal HS256-only JWT verifier.
 *
 * - Only `alg: "HS256"` is accepted. `"none"` and asymmetric algorithms are
 *   rejected outright — every historical JWT vulnerability has hinged on
 *   tricking a verifier into accepting an unexpected algorithm.
 * - Caller-supplied key ring (keyed by `kid`) supports rotation.
 * - Enforces `exp`, `nbf`, and optionally `iss`/`aud` with a small clock-skew
 *   tolerance.
 * - Does NOT issue tokens — issuance is handled by the auth service with a
 *   dedicated library; this package stays on the verify side.
 */

const ALLOWED_ALG = 'HS256';
const DEFAULT_SKEW_SECONDS = 60;

export interface JwtKey {
  readonly kid: string;
  readonly key: Uint8Array;
}

export interface JwtClaims {
  readonly sub?: string;
  readonly iss?: string;
  readonly aud?: string | readonly string[];
  readonly exp?: number;
  readonly nbf?: number;
  readonly iat?: number;
  readonly jti?: string;
  readonly [k: string]: unknown;
}

export interface VerifyJwtOptions {
  readonly keys: readonly JwtKey[];
  readonly now: number;
  readonly issuer?: string;
  readonly audience?: string;
  readonly clockSkewSeconds?: number;
}

export async function verifyJwt(token: string, options: VerifyJwtOptions): Promise<JwtClaims> {
  if (typeof token !== 'string' || token.length === 0) {
    throw new SecurityError({ reason: 'jwt.malformed', message: 'empty token' });
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new SecurityError({
      reason: 'jwt.malformed',
      message: 'token must be three dot-separated segments',
    });
  }
  const [h, p, s] = parts as [string, string, string];
  let headerObj: Record<string, unknown>;
  let payloadObj: Record<string, unknown>;
  try {
    headerObj = JSON.parse(base64urlToUtf8(h));
    payloadObj = JSON.parse(base64urlToUtf8(p));
  } catch {
    throw new SecurityError({ reason: 'jwt.malformed', message: 'could not decode token' });
  }
  if (headerObj['alg'] !== ALLOWED_ALG) {
    throw new SecurityError({
      reason: 'jwt.algorithm_not_allowed',
      message: `alg must be ${ALLOWED_ALG}`,
      detail: { alg: String(headerObj['alg']) },
    });
  }
  if (headerObj['typ'] !== undefined && headerObj['typ'] !== 'JWT') {
    throw new SecurityError({ reason: 'jwt.malformed', message: 'typ must be JWT' });
  }
  const kid = headerObj['kid'];
  if (typeof kid !== 'string') {
    throw new SecurityError({ reason: 'jwt.malformed', message: 'kid missing' });
  }
  const key = options.keys.find((k) => k.kid === kid);
  if (!key) {
    throw new SecurityError({
      reason: 'jwt.bad_signature',
      message: 'unknown kid',
      detail: { kid },
    });
  }

  const signingInput = `${h}.${p}`;
  const sigBytes = base64urlToBytes(s);
  if (!sigBytes) {
    throw new SecurityError({ reason: 'jwt.malformed', message: 'signature not base64url' });
  }

  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new SecurityError({ reason: 'jwt.malformed', message: 'WebCrypto unavailable' });
  }
  const cryptoKey = await c.subtle.importKey(
    'raw',
    new Uint8Array(key.key).buffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await c.subtle.verify(
    'HMAC',
    cryptoKey,
    sigBytes.buffer as ArrayBuffer,
    new TextEncoder().encode(signingInput),
  );
  if (!ok) {
    throw new SecurityError({ reason: 'jwt.bad_signature', message: 'HMAC mismatch' });
  }

  const skew = options.clockSkewSeconds ?? DEFAULT_SKEW_SECONDS;
  const now = options.now;

  const exp = payloadObj['exp'];
  if (typeof exp === 'number' && now - skew >= exp) {
    throw new SecurityError({
      reason: 'jwt.expired',
      message: 'token expired',
      detail: { exp, now },
    });
  }
  const nbf = payloadObj['nbf'];
  if (typeof nbf === 'number' && now + skew < nbf) {
    throw new SecurityError({
      reason: 'jwt.not_yet_valid',
      message: 'token not yet valid',
      detail: { nbf, now },
    });
  }
  if (options.issuer !== undefined && payloadObj['iss'] !== options.issuer) {
    throw new SecurityError({ reason: 'jwt.bad_signature', message: 'iss mismatch' });
  }
  if (options.audience !== undefined) {
    const aud = payloadObj['aud'];
    const audienceOk =
      aud === options.audience || (Array.isArray(aud) && aud.includes(options.audience));
    if (!audienceOk) {
      throw new SecurityError({ reason: 'jwt.bad_signature', message: 'aud mismatch' });
    }
  }
  return payloadObj as JwtClaims;
}

function base64urlToUtf8(s: string): string {
  const bytes = base64urlToBytes(s);
  if (!bytes) throw new Error('bad base64url');
  return new TextDecoder().decode(bytes);
}

function base64urlToBytes(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
