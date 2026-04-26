import { describe, expect, it } from 'vitest';

import { resolveServerGatewayName, serverGatewayPackageName } from './index.js';
import type { ServerGatewayPackageName } from './index.js';

describe('@sketchapedia/server-gateway scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(serverGatewayPackageName).toBe('@sketchapedia/server-gateway');
  });

  it('preserves the literal package name as a type', () => {
    const name: ServerGatewayPackageName = serverGatewayPackageName;
    expect(name).toHaveLength('@sketchapedia/server-gateway'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveServerGatewayName()).toBe(serverGatewayPackageName);
    expect(resolveServerGatewayName(null)).toBe(serverGatewayPackageName);
    expect(resolveServerGatewayName('')).toBe(serverGatewayPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveServerGatewayName('custom-alias')).toBe('custom-alias');
  });
});
