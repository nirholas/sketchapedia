import { describe, expect, it } from 'vitest';

import { clientCorePackageName, resolveClientCoreName } from './index.js';
import type { ClientCorePackageName } from './index.js';

describe('@sketchapedia/client-core scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(clientCorePackageName).toBe('@sketchapedia/client-core');
  });

  it('preserves the literal package name as a type', () => {
    const name: ClientCorePackageName = clientCorePackageName;
    expect(name).toHaveLength('@sketchapedia/client-core'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveClientCoreName()).toBe(clientCorePackageName);
    expect(resolveClientCoreName(null)).toBe(clientCorePackageName);
    expect(resolveClientCoreName('')).toBe(clientCorePackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveClientCoreName('custom-alias')).toBe('custom-alias');
  });
});
