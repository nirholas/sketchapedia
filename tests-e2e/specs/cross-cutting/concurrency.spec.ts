import { AppHarness } from '../../fixtures/app';
import { expect, test } from '../../fixtures/index';
import { mintIdentity } from '../../fixtures/tenant';

test.describe('Cross-cutting — concurrency', () => {
  test('two tabs from the same user are isolated sessions @light', async ({ browser }) => {
    const identityA = await mintIdentity({ userId: 'concurrent-user' });
    const identityB = await mintIdentity({ userId: 'concurrent-user' });

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const a = new AppHarness(pageA, ctxA, 'eiffel');
    const b = new AppHarness(pageB, ctxB, 'eiffel');

    await Promise.all([a.launch({ identity: identityA }), b.launch({ identity: identityB })]);

    // Drive different journeys in each tab; assert no cross-talk.
    await a.clickSceneRegion('eiffel-tower-pin');
    const aCommit = await a.waitForCommit((s) => s.sceneKey.includes('cross-section'));

    // Tab B is still on the landing scene.
    const bScene = await b.currentScene();
    expect(bScene?.sceneKey).toContain('paris-map');
    expect(aCommit.sceneId).not.toBe(bScene?.sceneId);

    // Each tab has its own sessionId.
    const aSession = await pageA.evaluate(() => window.__SKETCHAPEDIA__?.sessionId ?? '');
    const bSession = await pageB.evaluate(() => window.__SKETCHAPEDIA__?.sessionId ?? '');
    expect(aSession).not.toBe(bSession);

    await Promise.all([ctxA.close(), ctxB.close()]);
  });
});
