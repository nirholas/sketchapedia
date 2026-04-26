import { describe, expect, it } from 'vitest';

import { modelImagePackageName, resolveModelImageName } from './index.js';
import type { ModelImagePackageName } from './index.js';

describe('@sketchapedia/model-image scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(modelImagePackageName).toBe('@sketchapedia/model-image');
  });

  it('preserves the literal package name as a type', () => {
    const name: ModelImagePackageName = modelImagePackageName;
    expect(name).toHaveLength('@sketchapedia/model-image'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveModelImageName()).toBe(modelImagePackageName);
    expect(resolveModelImageName(null)).toBe(modelImagePackageName);
    expect(resolveModelImageName('')).toBe(modelImagePackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveModelImageName('custom-alias')).toBe('custom-alias');
  });
});
