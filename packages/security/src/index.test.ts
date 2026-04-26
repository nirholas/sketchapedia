import { describe, expect, it } from 'vitest';

import { resolveSecurityName, securityPackageName } from './index.js';
import type { SecurityPackageName } from './index.js';

describe('@sketchapedia/security scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(securityPackageName).toBe('@sketchapedia/security');
  });

  it('preserves the literal package name as a type', () => {
    const name: SecurityPackageName = securityPackageName;
    expect(name).toHaveLength('@sketchapedia/security'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveSecurityName()).toBe(securityPackageName);
    expect(resolveSecurityName(null)).toBe(securityPackageName);
    expect(resolveSecurityName('')).toBe(securityPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveSecurityName('custom-alias')).toBe('custom-alias');
  });
});
