import { describe, expect, it } from 'vitest';

import { examplesIceWaterPackageName, resolveExamplesIceWaterName } from './index.js';
import type { ExamplesIceWaterPackageName } from './index.js';

describe('@sketchapedia/examples-ice-water scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(examplesIceWaterPackageName).toBe('@sketchapedia/examples-ice-water');
  });

  it('preserves the literal package name as a type', () => {
    const name: ExamplesIceWaterPackageName = examplesIceWaterPackageName;
    expect(name).toHaveLength('@sketchapedia/examples-ice-water'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveExamplesIceWaterName()).toBe(examplesIceWaterPackageName);
    expect(resolveExamplesIceWaterName(null)).toBe(examplesIceWaterPackageName);
    expect(resolveExamplesIceWaterName('')).toBe(examplesIceWaterPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveExamplesIceWaterName('custom-alias')).toBe('custom-alias');
  });
});
