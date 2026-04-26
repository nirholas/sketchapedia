import { describe, expect, it } from 'vitest';

import { protocolPackageName, resolveProtocolName } from './index.js';
import type { ProtocolPackageName } from './index.js';

describe('@sketchapedia/protocol scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(protocolPackageName).toBe('@sketchapedia/protocol');
  });

  it('preserves the literal package name as a type', () => {
    const name: ProtocolPackageName = protocolPackageName;
    expect(name).toHaveLength('@sketchapedia/protocol'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveProtocolName()).toBe(protocolPackageName);
    expect(resolveProtocolName(null)).toBe(protocolPackageName);
    expect(resolveProtocolName('')).toBe(protocolPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveProtocolName('custom-alias')).toBe('custom-alias');
  });
});
