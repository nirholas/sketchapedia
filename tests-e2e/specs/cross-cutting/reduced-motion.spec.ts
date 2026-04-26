import { expect, test } from '../../fixtures/index';

test.use({ reducedMotion: 'reduce' });

test.describe('Cross-cutting — reduced motion @reduced-motion @light', () => {
  test('transitions degrade to crossfades and effects are muted', async ({
    eiffel,
    identity,
    page,
  }) => {
    await eiffel.launch({ identity });
    await eiffel.clickSceneRegion('eiffel-tower-pin');
    await eiffel.waitForCommit();

    // The renderer exposes a transition descriptor on the harness for tests.
    const transition = await page.evaluate(() => {
      const m = window.__SKETCHAPEDIA__?.metrics as Record<string, unknown> | undefined;
      return (m?.['lastTransition'] as string | undefined) ?? null;
    });
    expect(transition).toBe('crossfade');

    const effectsAmplitude = await page.evaluate(() => {
      const m = window.__SKETCHAPEDIA__?.metrics as Record<string, unknown> | undefined;
      return Number((m?.['effectsAmplitude'] as number | undefined) ?? 1);
    });
    expect(effectsAmplitude).toBeLessThanOrEqual(0.25);
  });
});
