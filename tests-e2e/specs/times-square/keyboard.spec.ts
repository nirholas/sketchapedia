import { expect, test } from '../../fixtures/index';

test.describe('Times Square — keyboard-only', () => {
  test('arrow-key stepping on the era slider drives scene state @light', async ({
    timesSquare,
    identity,
    page,
  }) => {
    await timesSquare.launch({ identity });
    const slider = page.getByRole('slider', { name: /era|decade/i });
    await slider.focus();
    const before = await slider.getAttribute('aria-valuenow');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const after = await slider.getAttribute('aria-valuenow');
    expect(after).not.toBe(before);
  });
});
