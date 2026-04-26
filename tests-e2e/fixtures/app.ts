import { type BrowserContext, type Page, expect } from '@playwright/test';

import { environment } from './environment';
import type { TenantIdentity } from './tenant';
import type { Announcement, SceneCommitRecord, SketchapediaHarness } from './test-hooks';

export type ReferenceAppId = 'eiffel' | 'ice-water' | 'times-square' | 'dashboard';

const APP_URL: Record<ReferenceAppId, string> = {
  eiffel: environment.appUrls.eiffel,
  'ice-water': environment.appUrls.iceWater,
  'times-square': environment.appUrls.timesSquare,
  dashboard: environment.appUrls.dashboard,
};

export type LaunchOptions = {
  identity: TenantIdentity;
  locale?: string;
  // Append extra query params onto the app URL (e.g. feature flags).
  query?: Record<string, string>;
  // Skip awaiting the first scene commit (a handful of tests want to race the load).
  skipInitialCommit?: boolean;
};

export class AppHarness {
  constructor(
    readonly page: Page,
    readonly context: BrowserContext,
    readonly appId: ReferenceAppId,
  ) {}

  async launch(options: LaunchOptions): Promise<SceneCommitRecord | null> {
    const url = new URL(APP_URL[this.appId]);
    url.searchParams.set('e2e', '1');
    if (options.locale) url.searchParams.set('locale', options.locale);
    for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);

    // Gateway endpoint + JWT travel as storage. The client reads these on mount.
    // See prompt 09 / 10 — the React provider looks up `gateway` and `token` here.
    await this.context.addInitScript(
      ({ gatewayWsUrl, jwt, tenantId, userId }) => {
        window.localStorage.setItem('sketchapedia.gateway', gatewayWsUrl);
        window.localStorage.setItem('sketchapedia.token', jwt);
        window.localStorage.setItem('sketchapedia.tenantId', tenantId);
        window.localStorage.setItem('sketchapedia.userId', userId);
      },
      {
        gatewayWsUrl: environment.gatewayWsUrl,
        jwt: options.identity.jwt,
        tenantId: options.identity.tenantId,
        userId: options.identity.userId,
      },
    );

    await this.page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await this.page.waitForFunction(() => Boolean(window.__SKETCHAPEDIA__), undefined, {
      timeout: 20_000,
    });

    if (options.skipInitialCommit) return null;
    return this.waitForCommit();
  }

  async waitForCommit(predicate?: (s: SceneCommitRecord) => boolean): Promise<SceneCommitRecord> {
    return this.page.evaluate(
      async ({ hasPred }) => {
        const h = window.__SKETCHAPEDIA__;
        if (!h) throw new Error('Sketchapedia test harness not present');
        // biome-ignore lint/complexity/useOptionalChain: predicate is serialized separately
        const pred = hasPred
          ? (window as unknown as { __e2e_pred?: (s: unknown) => boolean }).__e2e_pred
          : undefined;
        const s = await h.waitForSceneCommit(pred as never);
        return s;
      },
      { hasPred: Boolean(predicate) },
    );
  }

  async currentScene(): Promise<SceneCommitRecord | null> {
    return this.page.evaluate(() => window.__SKETCHAPEDIA__?.currentScene ?? null);
  }

  async committedScenes(): Promise<readonly SceneCommitRecord[]> {
    return this.page.evaluate(() => Array.from(window.__SKETCHAPEDIA__?.committedScenes ?? []));
  }

  async announcements(): Promise<readonly Announcement[]> {
    return this.page.evaluate(() => Array.from(window.__SKETCHAPEDIA__?.announcements ?? []));
  }

  async metrics(): Promise<SketchapediaHarness['metrics']> {
    return this.page.evaluate(() => ({
      ...(window.__SKETCHAPEDIA__?.metrics ??
        ({ scenesCommitted: 0, lastCacheHit: false, lastCommitDurationMs: 0 } as const)),
    }));
  }

  async clickSceneRegion(regionId: string): Promise<void> {
    // Every hitmap region is mirrored into a zero-opacity DOM overlay element with
    // `data-sketchapedia-region="<id>"`. Playwright targets that element so the
    // test remains stable even if the underlying canvas moves by a few pixels.
    await this.page.locator(`[data-sketchapedia-region="${regionId}"]`).click();
  }

  async focusSceneRegion(regionId: string): Promise<void> {
    await this.page.locator(`[data-sketchapedia-region="${regionId}"]`).focus();
  }

  async probeHitmap(x: number, y: number) {
    return this.page.evaluate(({ x, y }) => window.__SKETCHAPEDIA__?.hitmapAt(x, y) ?? null, {
      x,
      y,
    });
  }

  async assertHitmapAlignedTo(regionId: string): Promise<void> {
    const domRect = await this.page
      .locator(`[data-sketchapedia-region="${regionId}"]`)
      .boundingBox();
    expect(domRect, `region ${regionId} must be in the DOM overlay`).not.toBeNull();
    const cx = (domRect?.x ?? 0) + (domRect?.width ?? 0) / 2;
    const cy = (domRect?.y ?? 0) + (domRect?.height ?? 0) / 2;
    const probe = await this.probeHitmap(cx, cy);
    // Catches the "hitmap off by 20px" regression: if the underlying canvas hit
    // layer isn't aligned with the overlay rect, the probe returns a different id
    // (or null) from what's under the DOM element.
    expect(probe?.itemId, `hitmap at (${cx},${cy}) must resolve to region "${regionId}"`).toBe(
      regionId,
    );
  }

  async setLocale(locale: string): Promise<void> {
    await this.page.evaluate((l) => window.__SKETCHAPEDIA__?.setLocale(l), locale);
  }

  async clearClientCache(): Promise<void> {
    await this.page.evaluate(() => window.__SKETCHAPEDIA__?.clearClientCache());
  }

  async injectServerErrorOnce(): Promise<void> {
    await this.page.evaluate(() => window.__SKETCHAPEDIA__?.injectServerErrorOnce());
  }
}
