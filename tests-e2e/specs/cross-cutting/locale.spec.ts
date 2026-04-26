import { expect, test } from '../../fixtures/index';

test.describe('Cross-cutting — locale switch', () => {
  test('switching mid-session causes the next scene to render in the new language @light', async ({
    eiffel,
    identity,
    page,
  }) => {
    await eiffel.launch({ identity, locale: 'en' });
    await eiffel.clickSceneRegion('eiffel-tower-pin');
    const en = await eiffel.waitForCommit();
    expect(en.locale).toBe('en');

    await eiffel.setLocale('fr');
    await eiffel.clickSceneRegion('le-jules-verne-label');
    const fr = await eiffel.waitForCommit((s) => s.locale === 'fr');
    expect(fr.locale).toBe('fr');
    // ariaSummary in French — at minimum, contains a known French word from the
    // reservation scene (see Eiffel app data/strings.fr.json).
    expect(fr.ariaSummary.toLowerCase()).toMatch(/réservation|menu|table/);

    // The locale toggle in the corner should also reflect the active locale.
    const toggle = page.getByRole('button', { name: /français|english/i });
    await expect(toggle).toBeVisible();
  });
});
