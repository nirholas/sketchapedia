import { expect, test } from '../../fixtures/index';
import { setOffline } from '../../fixtures/network';

test.describe('Ice Water — resilience', () => {
  test('recovers from a mid-journey network blip @light', async ({ iceWater, identity, page }) => {
    await iceWater.launch({ identity });
    await iceWater.clickSceneRegion('order-start');
    await iceWater.waitForCommit();

    const restore = await setOffline(page);
    // Trigger an intent while offline. The router should enqueue it and retry.
    await iceWater.clickSceneRegion('drink-ice-water');
    await page.waitForTimeout(1200);
    await restore();

    const scene = await iceWater.waitForCommit((s) => s.sceneKey.includes('customise'));
    expect(scene.sceneKey).toContain('customise');
  });
});
