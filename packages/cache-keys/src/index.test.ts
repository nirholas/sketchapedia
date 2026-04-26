import { describe, expect, it } from 'vitest';

import { cacheKeysPackageName, resolveCacheKeysName } from './index.js';
import type { CacheKeysPackageName } from './index.js';

describe('@sketchapedia/cache-keys scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(cacheKeysPackageName).toBe('@sketchapedia/cache-keys');
  });

  it('preserves the literal package name as a type', () => {
    const name: CacheKeysPackageName = cacheKeysPackageName;
    expect(name).toHaveLength('@sketchapedia/cache-keys'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveCacheKeysName()).toBe(cacheKeysPackageName);
    expect(resolveCacheKeysName(null)).toBe(cacheKeysPackageName);
    expect(resolveCacheKeysName('')).toBe(cacheKeysPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveCacheKeysName('custom-alias')).toBe('custom-alias');
  });
});
