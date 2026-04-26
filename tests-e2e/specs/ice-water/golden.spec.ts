import { expectNoAxeViolations } from '../../fixtures/axe';
import { expect, test } from '../../fixtures/index';

// The "ice water" reference app (prompt 30) demonstrates a conversational
// onboarding flow rendered entirely as generated imagery.
test.describe('Ice Water — golden path', () => {
  test('greet → pick drink → customise → confirm @light', async ({ iceWater, identity, page }) => {
    const landing = await iceWater.launch({ identity });
    expect(landing?.sceneKey).toContain('greet');
    await iceWater.assertHitmapAlignedTo('order-start');
    await expectNoAxeViolations(page);

    await iceWater.clickSceneRegion('order-start');
    const menu = await iceWater.waitForCommit((s) => s.sceneKey.includes('menu'));
    expect(menu.sceneKey).toContain('menu');
    await expectNoAxeViolations(page);

    await iceWater.clickSceneRegion('drink-ice-water');
    const customise = await iceWater.waitForCommit((s) => s.sceneKey.includes('customise'));
    expect(customise.sceneKey).toContain('customise');
    await expectNoAxeViolations(page);

    // Customisation step offers ice level + temperature controls.
    await iceWater.clickSceneRegion('ice-level-light');
    await iceWater.waitForCommit();
    await iceWater.clickSceneRegion('confirm-order');

    const confirm = await iceWater.waitForCommit((s) => s.sceneKey.includes('confirm'));
    expect(confirm.sceneKey).toContain('confirm');
    await expect(page.getByText(/enjoy your ice water/i)).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
