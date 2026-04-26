import { expect, test } from '../../fixtures/index';

test.use({ forcedColors: 'active' });

test.describe('Cross-cutting — forced colors @forced-colors @light', () => {
  test('client requests a high-contrast rendering on the next intent', async ({
    eiffel,
    identity,
    page,
  }) => {
    await eiffel.launch({ identity });

    // The orchestrator stamps the render hint into a class on the host element.
    const hostClass = await page.evaluate(
      () => document.querySelector('[data-sketchapedia-host]')?.className ?? '',
    );
    expect(hostClass).toMatch(/high-contrast|forced-colors/);

    await eiffel.clickSceneRegion('eiffel-tower-pin');
    const next = await eiffel.waitForCommit();
    // The intent emitted to the server must include the forced-colors hint.
    const lastIntent = await page.evaluate(() => {
      const intents = window.__SKETCHAPEDIA__?.intents ?? [];
      return intents[intents.length - 1] ?? null;
    });
    expect(lastIntent?.payload).toMatchObject({ hints: { forcedColors: true } });
    expect(next.sceneKey).toContain('cross-section');
  });
});
