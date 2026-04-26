import { describe, expect, it } from 'vitest';

import { resolveTestsE2eName, testsE2ePackageName } from './index.js';
import type { TestsE2ePackageName } from './index.js';

describe('@sketchapedia/tests-e2e scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(testsE2ePackageName).toBe('@sketchapedia/tests-e2e');
  });

  it('preserves the literal package name as a type', () => {
    const name: TestsE2ePackageName = testsE2ePackageName;
    expect(name).toHaveLength('@sketchapedia/tests-e2e'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveTestsE2eName()).toBe(testsE2ePackageName);
    expect(resolveTestsE2eName(null)).toBe(testsE2ePackageName);
    expect(resolveTestsE2eName('')).toBe(testsE2ePackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveTestsE2eName('custom-alias')).toBe('custom-alias');
  });
});
