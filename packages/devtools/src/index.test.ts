import { describe, expect, it } from 'vitest';

import { devtoolsPackageName, resolveDevtoolsName } from './index.js';
import type { DevtoolsPackageName } from './index.js';

describe('@sketchapedia/devtools scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(devtoolsPackageName).toBe('@sketchapedia/devtools');
  });

  it('preserves the literal package name as a type', () => {
    const name: DevtoolsPackageName = devtoolsPackageName;
    expect(name).toHaveLength('@sketchapedia/devtools'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveDevtoolsName()).toBe(devtoolsPackageName);
    expect(resolveDevtoolsName(null)).toBe(devtoolsPackageName);
    expect(resolveDevtoolsName('')).toBe(devtoolsPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveDevtoolsName('custom-alias')).toBe('custom-alias');
  });
});
