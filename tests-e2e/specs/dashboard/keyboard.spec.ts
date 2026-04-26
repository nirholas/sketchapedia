import { expect, test } from '../../fixtures/index';

test.describe('Dashboard — keyboard-only', () => {
  test('modal scene traps focus and Esc fires dismissIntent @light', async ({
    dashboard,
    identity,
    page,
  }) => {
    await dashboard.launch({ identity });
    await dashboard.clickSceneRegion('widget-active-users');
    await dashboard.waitForCommit();
    await dashboard.clickSceneRegion('row-user-0');
    await dashboard.waitForCommit((s) => s.sceneKey.includes('user-detail'));

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Tab cycles inside the dialog. After a few tabs, focus is still within the dialog.
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
    const active = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return d?.contains(document.activeElement) ?? false;
    });
    expect(active, 'focus should be trapped within the modal dialog').toBe(true);

    // Esc → dismissIntent fires → modal closes and previous scene is restored.
    await page.keyboard.press('Escape');
    await dashboard.waitForCommit((s) => s.sceneKey.includes('users-drill'));
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});
