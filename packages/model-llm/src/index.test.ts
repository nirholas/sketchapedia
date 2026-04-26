import { describe, expect, it } from 'vitest';

import { modelLlmPackageName, resolveModelLlmName } from './index.js';
import type { ModelLlmPackageName } from './index.js';

describe('@sketchapedia/model-llm scaffold', () => {
  it('exports its canonical package name constant', () => {
    expect(modelLlmPackageName).toBe('@sketchapedia/model-llm');
  });

  it('preserves the literal package name as a type', () => {
    const name: ModelLlmPackageName = modelLlmPackageName;
    expect(name).toHaveLength('@sketchapedia/model-llm'.length);
  });

  it('returns the canonical name when no alias is given', () => {
    expect(resolveModelLlmName()).toBe(modelLlmPackageName);
    expect(resolveModelLlmName(null)).toBe(modelLlmPackageName);
    expect(resolveModelLlmName('')).toBe(modelLlmPackageName);
  });

  it('returns the alias when one is supplied', () => {
    expect(resolveModelLlmName('custom-alias')).toBe('custom-alias');
  });
});
