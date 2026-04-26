import { expectNoAxeViolations } from '../../fixtures/axe';
import { expect, test } from '../../fixtures/index';

test.describe('Eiffel — golden path', () => {
  test('map → cross-section → reservation → confirmation @light', async ({
    eiffel,
    identity,
    page,
  }) => {
    const landing = await eiffel.launch({ identity });
    expect(landing?.sceneKey).toContain('paris-map');
    expect(landing?.ariaSummary ?? '').not.toHaveLength(0);

    // Verify the hitmap is actually aligned with the DOM overlay — this is what a
    // "hitmap off by 20px" regression would fail.
    await eiffel.assertHitmapAlignedTo('eiffel-tower-pin');
    await expectNoAxeViolations(page);

    await eiffel.clickSceneRegion('eiffel-tower-pin');
    const crossSection = await eiffel.waitForCommit();
    expect(crossSection.sceneKey).toContain('eiffel-cross-section');
    await eiffel.assertHitmapAlignedTo('le-jules-verne-label');
    await expectNoAxeViolations(page);

    await eiffel.clickSceneRegion('le-jules-verne-label');
    const reservation = await eiffel.waitForCommit();
    expect(reservation.sceneKey).toContain('reservation');
    await expectNoAxeViolations(page);

    // Fill out the form and submit.
    await page.getByLabel(/party size/i).fill('3');
    await page.getByLabel(/occasion/i).fill('anniversary');
    await page.getByLabel(/seating preference/i).selectOption({ label: 'Window' });
    await page.getByLabel(/date/i).fill('2026-06-15');
    await page.getByRole('button', { name: /reserve/i }).click();

    const confirmation = await eiffel.waitForCommit((s) => s.sceneKey.includes('confirmation'));
    expect(confirmation.sceneKey).toContain('confirmation');
    await expectNoAxeViolations(page);

    // The confirmation number is a real server-issued identifier, see prompt 29.
    await expect(page.getByText(/confirmation number:/i)).toBeVisible();
  });

  test('golden path visual regression @nightly @visual', async ({ eiffel, identity, page }) => {
    await eiffel.launch({ identity });
    await expect(page).toHaveScreenshot('eiffel-landing.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
    await eiffel.clickSceneRegion('eiffel-tower-pin');
    await eiffel.waitForCommit();
    await expect(page).toHaveScreenshot('eiffel-cross-section.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  });
});
