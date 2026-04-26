import { expect, test } from '../../fixtures/index';
import { captureAnnouncements } from '../../fixtures/screen-reader';

test.describe('Ice Water — screen reader announcements', () => {
  test('each scene commit fires a non-empty polite announcement @light', async ({
    iceWater,
    identity,
    page,
  }) => {
    await iceWater.launch({ identity });

    const { announcements } = await captureAnnouncements(page, async () => {
      await iceWater.clickSceneRegion('order-start');
      await iceWater.waitForCommit();
      await iceWater.clickSceneRegion('drink-ice-water');
      await iceWater.waitForCommit();
      await iceWater.clickSceneRegion('ice-level-light');
      await iceWater.waitForCommit();
    });

    expect(announcements.length, 'at least one announcement per commit').toBeGreaterThanOrEqual(3);
    for (const a of announcements) {
      expect(a.text.trim(), 'announcements must be non-empty').not.toHaveLength(0);
      expect(a.level).toBe('polite');
    }
  });
});
