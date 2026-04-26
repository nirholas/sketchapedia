import { describe, expect, it } from 'vitest';

import { examplesEiffelPackageName, resolveExamplesEiffelName } from './index.js';
import type { ExamplesEiffelPackageName } from './index.js';

describe('@sketchapedia/examples-eiffel scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(examplesEiffelPackageName).toBe('@sketchapedia/examples-eiffel');
  });

  it('preserves the literal package name as a type', () => {
    const name: ExamplesEiffelPackageName = examplesEiffelPackageName;
    expect(name).toHaveLength('@sketchapedia/examples-eiffel'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveExamplesEiffelName()).toBe(examplesEiffelPackageName);
    expect(resolveExamplesEiffelName(null)).toBe(examplesEiffelPackageName);
    expect(resolveExamplesEiffelName('')).toBe(examplesEiffelPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveExamplesEiffelName('custom-alias')).toBe('custom-alias');
  });
});
