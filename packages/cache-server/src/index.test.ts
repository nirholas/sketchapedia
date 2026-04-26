import { describe, expect, it } from 'vitest';

import { cacheServerPackageName, resolveCacheServerName } from './index.js';
import type { CacheServerPackageName } from './index.js';

describe('@sketchapedia/cache-server scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(cacheServerPackageName).toBe('@sketchapedia/cache-server');
  });

  it('preserves the literal package name as a type', () => {
    const name: CacheServerPackageName = cacheServerPackageName;
    expect(name).toHaveLength('@sketchapedia/cache-server'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveCacheServerName()).toBe(cacheServerPackageName);
    expect(resolveCacheServerName(null)).toBe(cacheServerPackageName);
    expect(resolveCacheServerName('')).toBe(cacheServerPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveCacheServerName('custom-alias')).toBe('custom-alias');
  });
});
