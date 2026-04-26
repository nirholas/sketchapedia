import { expect, test } from '../../fixtures/index';

test.describe('Eiffel — reservation form', () => {
  test.beforeEach(async ({ eiffel, identity }) => {
    await eiffel.launch({ identity });
    await eiffel.clickSceneRegion('eiffel-tower-pin');
    await eiffel.waitForCommit();
    await eiffel.clickSceneRegion('le-jules-verne-label');
    await eiffel.waitForCommit((s) => s.sceneKey.includes('reservation'));
  });

  test('submits the intent with the correct payload @light', async ({ eiffel, page }) => {
    await page.getByLabel(/date/i).fill('2026-07-20');
    await page.getByLabel(/party size/i).fill('2');
    await page.getByLabel(/seating preference/i).selectOption({ label: 'Window' });
    await page.getByLabel(/occasion/i).fill('anniversary');
    await page.getByRole('button', { name: /reserve/i }).click();

    // The test harness records every intent dispatched to the server.
    const intents = await page.evaluate(() => Array.from(window.__SKETCHAPEDIA__?.intents ?? []));
    const reserve = intents.find((i) => i.type === 'reservation.submit');
    expect(reserve, 'expected a reservation.submit intent').toBeDefined();
    expect(reserve?.payload).toMatchObject({
      date: '2026-07-20',
      partySize: 2,
      seating: 'window',
      occasion: 'anniversary',
    });

    await eiffel.waitForCommit((s) => s.sceneKey.includes('confirmation'));
  });

  test('server-side validation rejects past dates @light', async ({ page }) => {
    await page.getByLabel(/date/i).fill('2020-01-01');
    await page.getByLabel(/party size/i).fill('2');
    await page.getByRole('button', { name: /reserve/i }).click();

    // The server returns an ErrorFrame surfaced as an aria-describedby on the date input.
    const input = page.getByLabel(/date/i);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await input.getAttribute('aria-describedby');
    expect(describedBy, 'aria-describedby should reference the error span').toBeTruthy();
    if (describedBy) {
      const errorText = await page.locator(`#${describedBy}`).textContent();
      expect(errorText ?? '').toMatch(/past|future/i);
    }
  });

  test('client-side validation rejects party size zero @light', async ({ page }) => {
    await page.getByLabel(/party size/i).fill('0');
    await page.getByRole('button', { name: /reserve/i }).click();
    await expect(page.getByLabel(/party size/i)).toHaveAttribute('aria-invalid', 'true');
  });
});
