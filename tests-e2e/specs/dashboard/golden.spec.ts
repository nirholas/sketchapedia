import { expectNoAxeViolations } from '../../fixtures/axe';
import { expect, test } from '../../fixtures/index';

// Reference app #4: an observability-style dashboard rendered as generated
// imagery with real data binding — stress-tests table regions, sparklines,
// and dialog overlays. See prompt 32.
test.describe('Dashboard — golden path', () => {
  test('overview → drill down → detail dialog @light', async ({ dashboard, identity, page }) => {
    const overview = await dashboard.launch({ identity });
    expect(overview?.sceneKey).toContain('overview');
    await dashboard.assertHitmapAlignedTo('widget-active-users');
    await expectNoAxeViolations(page);

    await dashboard.clickSceneRegion('widget-active-users');
    const drill = await dashboard.waitForCommit((s) => s.sceneKey.includes('users-drill'));
    expect(drill.sceneKey).toContain('users-drill');
    await expectNoAxeViolations(page);

    await dashboard.clickSceneRegion('row-user-0');
    const detail = await dashboard.waitForCommit((s) => s.sceneKey.includes('user-detail'));
    expect(detail.sceneKey).toContain('user-detail');

    // The detail scene is modal — expect a focus trap.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expectNoAxeViolations(page);
  });
});
