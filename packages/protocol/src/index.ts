/**
 * @sketchapedia/protocol
 *
 * Shared wire-protocol types and message schemas for Sketchapedia.
 *
 * Populated by prompt 02. This file is the scaffold stub produced by
 * prompt 01; it exports a canonical identifier plus a tiny branching helper so
 * that declaration emission, project references, and coverage thresholds can
 * all be exercised before the real module lands.
 */

export const protocolPackageName = '@sketchapedia/protocol' as const;

export type ProtocolPackageName = typeof protocolPackageName;

/**
 * Returns the canonical package name if `alias` is empty or undefined, otherwise
 * returns the alias unchanged. Trivial branching helper — its sole purpose is to
 * give the scaffold a reachable branch for coverage and a stable symbol for
 * cross-package smoke tests until prompt 02 lands.
 */
export function resolveProtocolName(alias?: string | null): string {
  if (alias !== null && alias !== undefined && alias.length > 0) {
    return alias;
  }
  return protocolPackageName;
}
