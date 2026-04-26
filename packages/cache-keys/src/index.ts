/**
 * @sketchapedia/cache-keys
 *
 * Content-addressed cache-key derivation shared by client and server.
 *
 * Populated by prompt 03. This file is the scaffold stub produced by
 * prompt 01; it exports a canonical identifier plus a tiny branching helper so
 * that declaration emission, project references, and coverage thresholds can
 * all be exercised before the real module lands.
 */

import { protocolPackageName } from '@sketchapedia/protocol';
import type { ProtocolPackageName } from '@sketchapedia/protocol';

/**
 * Compile-time attestation that this package can resolve the public surface of
 * every @sketchapedia/* dep it declares — tripped by any type error in a dep.
 * Prompt 01 uses this to prove composite project references are wired.
 */
export const cacheKeysDeps = [{ name: protocolPackageName satisfies ProtocolPackageName }] as const;

export const cacheKeysPackageName = '@sketchapedia/cache-keys' as const;

export type CacheKeysPackageName = typeof cacheKeysPackageName;

/**
 * Returns the canonical package name if `alias` is empty or undefined, otherwise
 * returns the alias unchanged. Trivial branching helper — its sole purpose is to
 * give the scaffold a reachable branch for coverage and a stable symbol for
 * cross-package smoke tests until prompt 03 lands.
 */
export function resolveCacheKeysName(alias?: string | null): string {
  if (alias !== null && alias !== undefined && alias.length > 0) {
    return alias;
  }
  return cacheKeysPackageName;
}
