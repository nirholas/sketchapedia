import { describe, expect, it } from 'vitest';

import { observabilityPackageName, resolveObservabilityName } from './index.js';
import type { ObservabilityPackageName } from './index.js';

describe('@sketchapedia/observability scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(observabilityPackageName).toBe('@sketchapedia/observability');
  });

  it('preserves the literal package name as a type', () => {
    const name: ObservabilityPackageName = observabilityPackageName;
    expect(name).toHaveLength('@sketchapedia/observability'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveObservabilityName()).toBe(observabilityPackageName);
    expect(resolveObservabilityName(null)).toBe(observabilityPackageName);
    expect(resolveObservabilityName('')).toBe(observabilityPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveObservabilityName('custom-alias')).toBe('custom-alias');
  });
});
