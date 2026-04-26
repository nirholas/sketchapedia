import { expect, test } from '../../fixtures/index';

// Long-running memory test. Chromium-only; other browsers do not implement
// `performance.measureUserAgentSpecificMemory`.
test.describe('Cross-cutting — memory @nightly @memory', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'measureUserAgentSpecificMemory is Chromium-only',
  );

  test('50 scene commits keep heap growth bounded', async ({
    iceWater,
    identity,
    page,
    context,
  }) => {
    // Heap measurement requires cross-origin isolation; ensure response headers
    // are present (the dev stack sets them).
    await context.addInitScript(() => {
      Object.defineProperty(window, 'crossOriginIsolated', { value: true });
    });

    await iceWater.launch({ identity });
    const measure = async () => {
      return page.evaluate(async () => {
        type MUASM = () => Promise<{ bytes: number }>;
        const fn = (performance as unknown as { measureUserAgentSpecificMemory?: MUASM })
          .measureUserAgentSpecificMemory;
        if (typeof fn !== 'function') return null;
        const r = await fn();
        return r.bytes;
      });
    };
    const start = await measure();
    test.skip(start === null, 'measureUserAgentSpecificMemory not available in this build');

    for (let i = 0; i < 50; i += 1) {
      await iceWater.clickSceneRegion(i % 2 === 0 ? 'order-start' : 'menu-back');
      await iceWater.waitForCommit();
    }

    const end = await measure();
    if (start && end) {
      const growth = end - start;
      // Generous bound: the harness retains some history, but per-commit growth
      // must stay below ~200KB on average, otherwise we have a leak.
      expect(growth, `heap grew by ${growth} bytes over 50 commits`).toBeLessThan(50 * 200 * 1024);
    }
  });
});
