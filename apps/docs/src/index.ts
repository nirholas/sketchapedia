/**
 * @sketchapedia/docs
 *
 * Sketchapedia documentation site.
 *
 * Populated by prompt 28. This file is the scaffold stub produced by
 * prompt 01; it exports a canonical identifier plus a tiny branching helper so
 * that declaration emission, project references, and coverage thresholds can
 * all be exercised before the real module lands.
 */

export const docsPackageName = '@sketchapedia/docs' as const;

export type DocsPackageName = typeof docsPackageName;

/**
 * Returns the canonical package name if `alias` is empty or undefined, otherwise
 * returns the alias unchanged. Trivial branching helper — its sole purpose is to
 * give the scaffold a reachable branch for coverage and a stable symbol for
 * cross-package smoke tests until prompt 28 lands.
 */
export function resolveDocsName(alias?: string | null): string {
  if (alias !== null && alias !== undefined && alias.length > 0) {
    return alias;
  }
  return docsPackageName;
}
