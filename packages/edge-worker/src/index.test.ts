import { describe, expect, it } from 'vitest';

import { edgeWorkerPackageName, resolveEdgeWorkerName } from './index.js';
import type { EdgeWorkerPackageName } from './index.js';

describe('@sketchapedia/edge-worker scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(edgeWorkerPackageName).toBe('@sketchapedia/edge-worker');
  });

  it('preserves the literal package name as a type', () => {
    const name: EdgeWorkerPackageName = edgeWorkerPackageName;
    expect(name).toHaveLength('@sketchapedia/edge-worker'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveEdgeWorkerName()).toBe(edgeWorkerPackageName);
    expect(resolveEdgeWorkerName(null)).toBe(edgeWorkerPackageName);
    expect(resolveEdgeWorkerName('')).toBe(edgeWorkerPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveEdgeWorkerName('custom-alias')).toBe('custom-alias');
  });
});
