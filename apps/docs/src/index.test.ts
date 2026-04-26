import { describe, expect, it } from 'vitest';

import { docsPackageName, resolveDocsName } from './index.js';
import type { DocsPackageName } from './index.js';

describe('@sketchapedia/docs scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(docsPackageName).toBe('@sketchapedia/docs');
  });

  it('preserves the literal package name as a type', () => {
    const name: DocsPackageName = docsPackageName;
    expect(name).toHaveLength('@sketchapedia/docs'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveDocsName()).toBe(docsPackageName);
    expect(resolveDocsName(null)).toBe(docsPackageName);
    expect(resolveDocsName('')).toBe(docsPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveDocsName('custom-alias')).toBe('custom-alias');
  });
});
