import { describe, expect, it } from 'vitest';

import { examplesTimesSquarePackageName, resolveExamplesTimesSquareName } from './index.js';
import type { ExamplesTimesSquarePackageName } from './index.js';

describe('@sketchapedia/examples-times-square scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(examplesTimesSquarePackageName).toBe('@sketchapedia/examples-times-square');
  });

  it('preserves the literal package name as a type', () => {
    const name: ExamplesTimesSquarePackageName = examplesTimesSquarePackageName;
    expect(name).toHaveLength('@sketchapedia/examples-times-square'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveExamplesTimesSquareName()).toBe(examplesTimesSquarePackageName);
    expect(resolveExamplesTimesSquareName(null)).toBe(examplesTimesSquarePackageName);
    expect(resolveExamplesTimesSquareName('')).toBe(examplesTimesSquarePackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveExamplesTimesSquareName('custom-alias')).toBe('custom-alias');
  });
});
