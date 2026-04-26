import { expectNoAxeViolations } from '../../fixtures/axe';
import { expect, test } from '../../fixtures/index';

test.describe('Ice Water — keyboard-only', () => {
  test('journey reachable without pointer events @light', async ({ iceWater, identity, page }) => {
    await iceWater.launch({ identity });

    for (const region of ['order-start', 'drink-ice-water', 'ice-level-light', 'confirm-order']) {
      await page.keyboard.press('Tab');
      await expect(page.locator(`[data-sketchapedia-region="${region}"]`)).toBeFocused();
      await page.keyboard.press('Enter');
      await iceWater.waitForCommit();
    }

    await expect(page.getByText(/enjoy your ice water/i)).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
