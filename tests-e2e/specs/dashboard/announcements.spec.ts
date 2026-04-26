import { expect, test } from '../../fixtures/index';
import { captureAnnouncements } from '../../fixtures/screen-reader';

test.describe('Dashboard — screen reader announcements', () => {
  test('modal commit emits an assertive announcement @light', async ({
    dashboard,
    identity,
    page,
  }) => {
    await dashboard.launch({ identity });

    const { announcements } = await captureAnnouncements(page, async () => {
      await dashboard.clickSceneRegion('widget-active-users');
      await dashboard.waitForCommit();
      await dashboard.clickSceneRegion('row-user-0');
      await dashboard.waitForCommit((s) => s.sceneKey.includes('user-detail'));
    });

    // Modal scene entry should produce at least one assertive announcement so
    // screen readers interrupt other output — see prompt 13.
    expect(announcements.some((a) => a.level === 'assertive')).toBe(true);
    expect(announcements.every((a) => a.text.trim().length > 0)).toBe(true);
  });
});
