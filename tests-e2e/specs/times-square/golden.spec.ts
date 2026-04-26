import { expectNoAxeViolations } from '../../fixtures/axe';
import { expect, test } from '../../fixtures/index';

test.describe('Times Square — golden path', () => {
  test('land → choose decade → pick restaurant → book @light', async ({
    timesSquare,
    identity,
    page,
  }) => {
    const landing = await timesSquare.launch({ identity });
    expect(landing?.sceneKey).toContain('times-square');
    await timesSquare.assertHitmapAlignedTo('era-scrubber');
    await expectNoAxeViolations(page);

    // Move the scrubber with a pointer; verify a scene commit with new state.
    const slider = page.getByRole('slider', { name: /era|decade/i });
    await slider.focus();
    await page.keyboard.press('End');
    const modern = await timesSquare.waitForCommit();
    expect(modern.sceneKey).toContain('times-square');

    await timesSquare.clickSceneRegion('restaurant-marquee');
    const restaurant = await timesSquare.waitForCommit((s) => s.sceneKey.includes('restaurant'));
    expect(restaurant.sceneKey).toContain('restaurant');
    await expectNoAxeViolations(page);

    await timesSquare.clickSceneRegion('book-table');
    const booking = await timesSquare.waitForCommit((s) => s.sceneKey.includes('booking'));
    expect(booking.sceneKey).toContain('booking');
    await expectNoAxeViolations(page);
  });
});
