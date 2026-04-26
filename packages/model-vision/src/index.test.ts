import { describe, expect, it } from 'vitest';

import { modelVisionPackageName, resolveModelVisionName } from './index.js';
import type { ModelVisionPackageName } from './index.js';

describe('@sketchapedia/model-vision scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(modelVisionPackageName).toBe('@sketchapedia/model-vision');
  });

  it('preserves the literal package name as a type', () => {
    const name: ModelVisionPackageName = modelVisionPackageName;
    expect(name).toHaveLength('@sketchapedia/model-vision'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveModelVisionName()).toBe(modelVisionPackageName);
    expect(resolveModelVisionName(null)).toBe(modelVisionPackageName);
    expect(resolveModelVisionName('')).toBe(modelVisionPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveModelVisionName('custom-alias')).toBe('custom-alias');
  });
});
