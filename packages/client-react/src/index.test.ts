import { describe, expect, it } from 'vitest';

import { clientReactPackageName, resolveClientReactName } from './index.js';
import type { ClientReactPackageName } from './index.js';

describe('@sketchapedia/client-react scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(clientReactPackageName).toBe('@sketchapedia/client-react');
  });

  it('preserves the literal package name as a type', () => {
    const name: ClientReactPackageName = clientReactPackageName;
    expect(name).toHaveLength('@sketchapedia/client-react'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveClientReactName()).toBe(clientReactPackageName);
    expect(resolveClientReactName(null)).toBe(clientReactPackageName);
    expect(resolveClientReactName('')).toBe(clientReactPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveClientReactName('custom-alias')).toBe('custom-alias');
  });
});
