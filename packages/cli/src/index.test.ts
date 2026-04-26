import { describe, expect, it } from 'vitest';

import { cliPackageName, resolveCliName } from './index.js';
import type { CliPackageName } from './index.js';

describe('@sketchapedia/cli scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(cliPackageName).toBe('@sketchapedia/cli');
  });

  it('preserves the literal package name as a type', () => {
    const name: CliPackageName = cliPackageName;
    expect(name).toHaveLength('@sketchapedia/cli'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveCliName()).toBe(cliPackageName);
    expect(resolveCliName(null)).toBe(cliPackageName);
    expect(resolveCliName('')).toBe(cliPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveCliName('custom-alias')).toBe('custom-alias');
  });
});
