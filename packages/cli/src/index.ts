/**
 * @sketchapedia/cli
 *
 * `sketchapedia` command-line tool — project scaffolding, scene inspection, local dev server.
 *
 * Populated by prompt 27. This file is the scaffold stub produced by
 * prompt 01; it exports a canonical identifier plus a tiny branching helper so
 * that declaration emission, project references, and coverage thresholds can
 * all be exercised before the real module lands.
 */

import { cacheKeysPackageName } from '@sketchapedia/cache-keys';
import type { CacheKeysPackageName } from '@sketchapedia/cache-keys';
import { clientCorePackageName } from '@sketchapedia/client-core';
import type { ClientCorePackageName } from '@sketchapedia/client-core';
import { protocolPackageName } from '@sketchapedia/protocol';
import type { ProtocolPackageName } from '@sketchapedia/protocol';

/**
 * Compile-time attestation that this package can resolve the public surface of
 * every @sketchapedia/* dep it declares — tripped by any type error in a dep.
 * Prompt 01 uses this to prove composite project references are wired.
 */
export const cliDeps = [
  { name: cacheKeysPackageName satisfies CacheKeysPackageName },
  { name: clientCorePackageName satisfies ClientCorePackageName },
  { name: protocolPackageName satisfies ProtocolPackageName },
] as const;

export const cliPackageName = '@sketchapedia/cli' as const;

export type CliPackageName = typeof cliPackageName;

/**
 * Returns the canonical package name if `alias` is empty or undefined, otherwise
 * returns the alias unchanged. Trivial branching helper — its sole purpose is to
 * give the scaffold a reachable branch for coverage and a stable symbol for
 * cross-package smoke tests until prompt 27 lands.
 */
export function resolveCliName(alias?: string | null): string {
  if (alias !== null && alias !== undefined && alias.length > 0) {
    return alias;
  }
  return cliPackageName;
}
