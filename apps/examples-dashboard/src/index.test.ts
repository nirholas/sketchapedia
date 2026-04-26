import { describe, expect, it } from 'vitest';

import { examplesDashboardPackageName, resolveExamplesDashboardName } from './index.js';
import type { ExamplesDashboardPackageName } from './index.js';

describe('@sketchapedia/examples-dashboard scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(examplesDashboardPackageName).toBe('@sketchapedia/examples-dashboard');
  });

  it('preserves the literal package name as a type', () => {
    const name: ExamplesDashboardPackageName = examplesDashboardPackageName;
    expect(name).toHaveLength('@sketchapedia/examples-dashboard'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveExamplesDashboardName()).toBe(examplesDashboardPackageName);
    expect(resolveExamplesDashboardName(null)).toBe(examplesDashboardPackageName);
    expect(resolveExamplesDashboardName('')).toBe(examplesDashboardPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveExamplesDashboardName('custom-alias')).toBe('custom-alias');
  });
});
