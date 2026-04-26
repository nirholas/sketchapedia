import { describe, expect, it } from 'vitest';

import { resolveServerOrchestratorName, serverOrchestratorPackageName } from './index.js';
import type { ServerOrchestratorPackageName } from './index.js';

describe('@sketchapedia/server-orchestrator scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(serverOrchestratorPackageName).toBe('@sketchapedia/server-orchestrator');
  });

  it('preserves the literal package name as a type', () => {
    const name: ServerOrchestratorPackageName = serverOrchestratorPackageName;
    expect(name).toHaveLength('@sketchapedia/server-orchestrator'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveServerOrchestratorName()).toBe(serverOrchestratorPackageName);
    expect(resolveServerOrchestratorName(null)).toBe(serverOrchestratorPackageName);
    expect(resolveServerOrchestratorName('')).toBe(serverOrchestratorPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveServerOrchestratorName('custom-alias')).toBe('custom-alias');
  });
});
