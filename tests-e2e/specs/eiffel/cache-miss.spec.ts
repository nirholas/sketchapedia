import { purgeServerCache } from '../../fixtures/cache';
import { expect, test } from '../../fixtures/index';

// Cache-miss tests exercise the real model round-trip and are nightly-only to
// keep CI cost low. The @slow tag aligns with the prompt's "slow test profile".
test.describe('Eiffel — cache miss @nightly @slow', () => {
  test('journey still converges when client and server caches are cold', async ({
    eiffel,
    identity,
  }) => {
    await purgeServerCache(identity);
    await eiffel.launch({ identity });
    await eiffel.clearClientCache();

    // Landing already rendered; push forward.
    await eiffel.clickSceneRegion('eiffel-tower-pin');
    const crossSection = await eiffel.waitForCommit();
    expect(crossSection.cacheHit).toBe(false);
    expect(crossSection.durationMs).toBeGreaterThan(0);
    expect(crossSection.sceneKey).toContain('cross-section');

    await eiffel.clickSceneRegion('le-jules-verne-label');
    const reservation = await eiffel.waitForCommit((s) => s.sceneKey.includes('reservation'));
    expect(reservation.sceneKey).toContain('reservation');
  });
});
