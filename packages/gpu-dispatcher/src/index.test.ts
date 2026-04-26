import { describe, expect, it } from 'vitest';

import { gpuDispatcherPackageName, resolveGpuDispatcherName } from './index.js';
import type { GpuDispatcherPackageName } from './index.js';

describe('@sketchapedia/gpu-dispatcher scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(gpuDispatcherPackageName).toBe('@sketchapedia/gpu-dispatcher');
  });

  it('preserves the literal package name as a type', () => {
    const name: GpuDispatcherPackageName = gpuDispatcherPackageName;
    expect(name).toHaveLength('@sketchapedia/gpu-dispatcher'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveGpuDispatcherName()).toBe(gpuDispatcherPackageName);
    expect(resolveGpuDispatcherName(null)).toBe(gpuDispatcherPackageName);
    expect(resolveGpuDispatcherName('')).toBe(gpuDispatcherPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveGpuDispatcherName('custom-alias')).toBe('custom-alias');
  });
});
