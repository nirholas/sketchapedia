import { expectNoAxeViolations } from '../../fixtures/axe';
import { expect, test } from '../../fixtures/index';

test.describe('Eiffel — keyboard-only', () => {
  test('complete the reservation journey without a pointer @light', async ({
    eiffel,
    identity,
    page,
  }) => {
    await eiffel.launch({ identity });

    // Tab until the Eiffel Tower pin receives focus, then Enter.
    await page.keyboard.press('Tab');
    // The overlay's focus order mirrors DOM tabindex declared in the scene graph.
    // See prompt 06/13: the landing scene's first focusable region is the Eiffel pin.
    await expect(page.locator('[data-sketchapedia-region="eiffel-tower-pin"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await eiffel.waitForCommit((s) => s.sceneKey.includes('cross-section'));

    await page.keyboard.press('Tab');
    await expect(page.locator('[data-sketchapedia-region="le-jules-verne-label"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await eiffel.waitForCommit((s) => s.sceneKey.includes('reservation'));

    // Form: Tab through fields, type, submit with Enter on the submit button.
    await page.getByLabel(/date/i).focus();
    await page.keyboard.type('2026-06-15');
    await page.keyboard.press('Tab');
    await page.keyboard.type('4');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await page.keyboard.type('birthday');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');

    await eiffel.waitForCommit((s) => s.sceneKey.includes('confirmation'));
    await expect(page.getByText(/confirmation number:/i)).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
