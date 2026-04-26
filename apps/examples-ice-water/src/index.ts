/**
 * @sketchapedia/examples-ice-water
 *
 * Reference app: Why Does Ice Float — molecular diagrams morphing into photorealistic water footage.
 *
 * Populated by prompt 30. This file is the scaffold stub produced by
 * prompt 01; it exports a canonical identifier plus a tiny branching helper so
 * that declaration emission, project references, and coverage thresholds can
 * all be exercised before the real module lands.
 */

import { clientCorePackageName } from '@sketchapedia/client-core';
import type { ClientCorePackageName } from '@sketchapedia/client-core';
import { clientReactPackageName } from '@sketchapedia/client-react';
import type { ClientReactPackageName } from '@sketchapedia/client-react';
import { protocolPackageName } from '@sketchapedia/protocol';
import type { ProtocolPackageName } from '@sketchapedia/protocol';

/**
 * Compile-time attestation that this package can resolve the public surface of
 * every @sketchapedia/* dep it declares — tripped by any type error in a dep.
 * Prompt 01 uses this to prove composite project references are wired.
 */
export const examplesIceWaterDeps = [
  { name: clientCorePackageName satisfies ClientCorePackageName },
  { name: clientReactPackageName satisfies ClientReactPackageName },
  { name: protocolPackageName satisfies ProtocolPackageName },
] as const;

export const examplesIceWaterPackageName = '@sketchapedia/examples-ice-water' as const;

export type ExamplesIceWaterPackageName = typeof examplesIceWaterPackageName;

/**
 * Returns the canonical package name if `alias` is empty or undefined, otherwise
 * returns the alias unchanged. Trivial branching helper — its sole purpose is to
 * give the scaffold a reachable branch for coverage and a stable symbol for
 * cross-package smoke tests until prompt 30 lands.
 */
export function resolveExamplesIceWaterName(alias?: string | null): string {
  if (alias !== null && alias !== undefined && alias.length > 0) {
    return alias;
  }
  return examplesIceWaterPackageName;
}
