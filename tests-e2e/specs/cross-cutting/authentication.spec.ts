import { expect, test } from '../../fixtures/index';
import { mintIdentity } from '../../fixtures/tenant';

test.describe('Cross-cutting — authentication', () => {
  test('garbage JWT is rejected by the gateway with a clear UI state @light', async ({
    eiffel,
    page,
  }) => {
    const identity = await mintIdentity({ invalid: 'garbage' });
    await eiffel.launch({ identity, skipInitialCommit: true });

    // The client surfaces auth failure with an alert + retry CTA.
    const alert = page.getByRole('alert').filter({ hasText: /auth|sign.in|session/i });
    await expect(alert).toBeVisible();
  });

  test('expired JWT is rejected with the same surface @light', async ({ eiffel, page }) => {
    const identity = await mintIdentity({ invalid: 'expired' });
    await eiffel.launch({ identity, skipInitialCommit: true });
    await expect(page.getByRole('alert').filter({ hasText: /expired|sign.in/i })).toBeVisible();
  });
});
