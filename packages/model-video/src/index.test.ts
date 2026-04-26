import { describe, expect, it } from 'vitest';

import { modelVideoPackageName, resolveModelVideoName } from './index.js';
import type { ModelVideoPackageName } from './index.js';

describe('@sketchapedia/model-video scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(modelVideoPackageName).toBe('@sketchapedia/model-video');
  });

  it('preserves the literal package name as a type', () => {
    const name: ModelVideoPackageName = modelVideoPackageName;
    expect(name).toHaveLength('@sketchapedia/model-video'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveModelVideoName()).toBe(modelVideoPackageName);
    expect(resolveModelVideoName(null)).toBe(modelVideoPackageName);
    expect(resolveModelVideoName('')).toBe(modelVideoPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveModelVideoName('custom-alias')).toBe('custom-alias');
  });
});
