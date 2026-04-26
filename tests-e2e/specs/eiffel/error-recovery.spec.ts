import { expect, test } from '../../fixtures/index';

test.describe('Eiffel — error recovery', () => {
  test('server error mid-generation surfaces recovery UI and resumes @light', async ({
    eiffel,
    identity,
    page,
  }) => {
    await eiffel.launch({ identity });
    await eiffel.clickSceneRegion('eiffel-tower-pin');
    await eiffel.waitForCommit();

    // Next scene commit gets a synthesised server error (see prompt 24 feature flag).
    await eiffel.injectServerErrorOnce();
    await eiffel.clickSceneRegion('le-jules-verne-label');

    const recovery = page.getByRole('alert').filter({ hasText: /problem|try again/i });
    await expect(recovery).toBeVisible();

    // The recovery surface has a retry affordance — activating it should resume.
    await page.getByRole('button', { name: /try again|retry/i }).click();
    const reservation = await eiffel.waitForCommit((s) => s.sceneKey.includes('reservation'));
    expect(reservation.sceneKey).toContain('reservation');
  });
});
